import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'crypto'
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import type {
  LibraryMount,
  LibraryConfig,
} from './config'
import { getLibraryConfig, VIDEO_EXTENSIONS } from './config'
import {
  getLibraryMounts,
  recordScanResult,
} from '../scan-library/manager'
import { probeVideo, extractVideoFrame } from './ffmpeg'
import { generateThumbnailAndHash } from '../image/thumbnail'
import { extractExifData, extractPhotoInfo } from '../image/exif'
import { parseGPSCoordinates } from '../location/geocoding'
import { compressUint8Array } from '~~/shared/utils/u8array'
import { getStorageManager } from '~~/server/plugins/3.storage'
import type { Photo } from '~~/server/utils/db'

const log = () => logger.dynamic('library')

const sanitizeRelPath = (p: string): string =>
  p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/')

/**
 * 根据挂载名 + 相对路径生成稳定且唯一的照片 ID
 */
export const buildLibraryPhotoId = (mount: string, relPath: string): string => {
  const hash = crypto
    .createHash('md5')
    .update(`${mount}:${relPath}`)
    .digest('hex')
    .slice(0, 16)
  const base = path
    .basename(relPath, path.extname(relPath))
    .replace(/\.[a-z0-9]+$/i, '')
  const cleanedBase = (base || 'media').replace(/[^\w\-_.]/g, '_').slice(0, 24)
  return `lib_${cleanedBase}_${hash}`
}

interface ScanResult {
  indexed: number
  updated: number
  failed: number
  errors: string[]
}

/**
 * 本地媒体库扫描器
 * - 只读映射目录（默认 /app/photos、/app/videos）
 * - 自动识别目录内图片 / 视频，自动生成缩略图
 * - 不改写原文件（原图始终引用映射目录，缩略图落在可写数据目录）
 */
export class LibraryScanner {
  private cfg: LibraryConfig
  private mounts: LibraryMount[]

  constructor() {
    this.cfg = getLibraryConfig()
    // 挂载集合延迟到首次扫描时再构建：getLibraryMounts() 会查询 scan_libraries 表，
    // 而该表在全新部署（空数据库）中需由 0.db-migrate 迁移插件创建。
    // 若在模块加载期（早于任何插件）即查询，会因表不存在而启动崩溃。
    // scanAll / scanMountByName 每次都会主动刷新 this.mounts，
    // collectFiles 仅依赖其扩展名集合，因此此处置空是安全的。
    this.mounts = []
  }

  getConfig() {
    return this.cfg
  }

  /**
   * 扫描单个挂载目录
   */
  async scanMount(mount: LibraryMount): Promise<ScanResult> {
    const result: ScanResult = { indexed: 0, updated: 0, failed: 0, errors: [] }
    const storageProvider = getStorageManager()?.getProvider()
    if (!storageProvider) {
      result.errors.push('Storage manager not initialized')
      return result
    }

    let rootExists = false
    try {
      await fs.access(mount.root)
      rootExists = true
    } catch {
      // 目录不存在（未映射），跳过
    }
    if (!rootExists) {
      log().warn(`Library mount not available, skipped: ${mount.root}`)
      return result
    }

    // 防御：禁止把整个文件系统根目录当作媒体库扫描
    if (path.parse(mount.root).root === mount.root) {
      log().error(
        `Refusing to scan filesystem root as library mount: ${mount.root}`,
      )
      return result
    }

    const files = await this.collectFiles(mount.root)

    const seen = new Set<string>()
    for (const absFile of files) {
      try {
        const rel = sanitizeRelPath(path.relative(mount.root, absFile))
        seen.add(rel)
        const stat = await fs.stat(absFile)
        const photoId = buildLibraryPhotoId(mount.name, rel)

        const db = useDB()
        const existing = db
          .select()
          .from(tables.photos)
          .where(eq(tables.photos.id, photoId))
          .get()

        // 已存在且未被更新，跳过
        if (existing && existing.lastModified === stat.mtime.toISOString()) {
          continue
        }

        const changed = existing !== undefined
        const entry = await this.processFile(mount, rel, absFile, stat, storageProvider)
        if (!entry) {
          result.failed++
          continue
        }

        if (changed) {
          result.updated++
          await db.update(tables.photos).set(entry).where(eq(tables.photos.id, photoId)).run()
        } else {
          result.indexed++
          await db.insert(tables.photos).values({ id: photoId, ...entry }).run()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        result.errors.push(`${path.basename(absFile)}: ${msg}`)
        result.failed++
      }
    }

    // 清理已失效的条目：文件已从挂载目录移除/变更挂载点后，删除旧 library 记录，避免残留垃圾
    try {
      const db = useDB()
      const stale = db
        .select({ id: tables.photos.id, libraryPath: tables.photos.libraryPath })
        .from(tables.photos)
        .where(eq(tables.photos.source, 'library'))
        .where(eq(tables.photos.libraryMount, mount.name))
        .all()
        .filter((row) => row.libraryPath && !seen.has(row.libraryPath))
      if (stale.length) {
        for (const row of stale) {
          await db
            .delete(tables.photos)
            .where(eq(tables.photos.id, row.id))
            .run()
        }
        log().info(`Pruned ${stale.length} stale library entry(ies) from "${mount.name}"`)
      }
    } catch (pruneErr) {
      log().warn(`Failed to prune stale library entries:`, pruneErr)
    }

    // 空闲扫描（indexed/updated/failed 全为 0 时）保持静默，避免轮询循环刷屏；
    // 仅在确有增删改或失败时输出 info，合并为一行便于排查
    const hasWork =
      result.indexed > 0 || result.updated > 0 || result.failed > 0
    log()[hasWork ? 'info' : 'debug'](
      `Scan "${mount.name}" at ${mount.root}: found ${files.length} media file(s); ` +
        `done: indexed=${result.indexed} updated=${result.updated} failed=${result.failed}`,
    )
    // 回写扫描库最近状态（挂载名为 scan_<id> 时）
    recordScanResult(mount.name, {
      indexed: result.indexed,
      updated: result.updated,
      failed: result.failed,
    })
    return result
  }

  /**
   * 扫描全部挂载目录
   */
  async scanAll(): Promise<Record<string, ScanResult>> {
    // 每次从数据库重建挂载集合：新增/启用的扫描库立即生效（无需重启）
    this.mounts = getLibraryMounts()
    const out: Record<string, ScanResult> = {}
    for (const mount of this.mounts) {
      out[mount.name] = await this.scanMount(mount)
    }
    return out
  }

  /**
   * 按挂载名触发单目录扫描（供“立即扫描”使用）
   */
  async scanMountByName(name: string): Promise<ScanResult | null> {
    this.mounts = getLibraryMounts()
    const mount = this.mounts.find((m) => m.name === name)
    return mount ? await this.scanMount(mount) : null
  }

  /**
 * 本地扫描库索引根目录内的子目录名：含缩略图目录、隐藏目录等，均跳过不扫
 */
private static readonly LIBRARY_SKIP_DIRS = new Set([
  '.thumbnails',
  'thumbnails',
  '.thumb',
  '.thumbs',
])

/**
 * 递归收集目录内支持的媒体文件
 */
private async collectFiles(dir: string): Promise<string[]> {
    const results: string[] = []
    const exts = new Set<string>()
    for (const mount of this.mounts) {
      for (const e of mount.extensions) exts.add(e)
    }

    const walk = async (current: string) => {
      let entries
      try {
        entries = await fs.readdir(current, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const skipName = LibraryScanner.LIBRARY_SKIP_DIRS.has(entry.name)
        if (entry.name.startsWith('.') || skipName) continue
        const abs = path.join(current, entry.name)
        if (entry.isDirectory()) {
          await walk(abs)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (exts.has(ext)) results.push(abs)
        }
      }
    }

    await walk(dir)
    return results
  }

  /**
   * 处理单个媒体文件：提取元数据 + 生成缩略图，返回入库字段
   */
  private async processFile(
    mount: LibraryMount,
    rel: string,
    absFile: string,
    stat: Awaited<ReturnType<typeof fs.stat>>,
    _storageProvider: any,
  ): Promise<Partial<Photo> | null> {
    const photoId = buildLibraryPhotoId(mount.name, rel)
    const relUrl = encodeURIComponent(rel).replace(/%2F/g, '/')
    // 原文件只读引用：通过 /library/<mountName>/<relpath> 访问
    const originalUrl = `/library/${mount.name}/${relUrl}`

    // 缩略图就地生成：写入挂载根目录下的 thumbnails/ 子目录，随相册一起存在、便于管理。
    // 通过原图路由 /library/<mountName>/thumbnails/<id>.webp 访问（该路由能 serve 挂载根下任意文件）。
    const thumbFileName = `${photoId}.webp`
    const thumbRelKey = `thumbnails/${thumbFileName}`
    const thumbAbsPath = path.resolve(mount.root, thumbRelKey)
    const thumbnailPublicUrl = `/library/${mount.name}/thumbnails/${thumbFileName}`

    // 就地写入缩略图（确保子目录存在）
    const writeThumbnailInPlace = async (
      buffer: Buffer,
    ): Promise<string | null> => {
      try {
        await fs.mkdir(path.dirname(thumbAbsPath), { recursive: true })
        await fs.writeFile(thumbAbsPath, buffer)
        return thumbRelKey
      } catch (err) {
        log().warn(
          `Failed to write in-place thumbnail for ${absFile}:`,
          err,
        )
        return null
      }
    }

    // 一个文件夹内可混放图片和视频：按单个文件扩展名判定类型
    const fileExt = path.extname(absFile).toLowerCase()
    const isImage = !VIDEO_EXTENSIONS.has(fileExt)

    if (isImage) {
      try {
        let imageBuffer = await fs.readFile(absFile)
        // HEIC/HEIF 需转 JPEG (对 exif/sharp 友好)
        const ext = path.extname(absFile).toLowerCase()
        if (['.heic', '.heif', '.hif'].includes(ext)) {
          const { convertHeicToJpeg } = await import('../image/processor')
          imageBuffer = await convertHeicToJpeg(imageBuffer)
        }

        const { width, height } = await sharp(imageBuffer, {
          limitInputPixels: false,
        })
          .rotate()
          .metadata()
        const { thumbnailBuffer, thumbnailHash } =
          await generateThumbnailAndHash(imageBuffer)

        const written = await writeThumbnailInPlace(thumbnailBuffer)

        // EXIF
        let exifData: Awaited<ReturnType<typeof extractExifData>> = null
        try {
          exifData = await extractExifData(imageBuffer, imageBuffer)
        } catch {
          /* ignore */
        }
        const photoInfo = extractPhotoInfo(rel, exifData)
        const coords = exifData ? parseGPSCoordinates(exifData) : null

        const thumbnailUrl = written ? thumbnailPublicUrl : null

        return {
          title: photoInfo.title,
          description: photoInfo.description,
          width: width || null,
          height: height || null,
          aspectRatio:
            width && height && height > 0 ? width / height : null,
          dateTaken: photoInfo.dateTaken,
          storageKey: `${mount.name}/${rel}`,
          thumbnailKey: written || null,
          fileSize: stat.size,
          lastModified: stat.mtime.toISOString(),
          originalUrl,
          thumbnailUrl,
          thumbnailHash: thumbnailHash
            ? compressUint8Array(thumbnailHash)
            : null,
          tags: photoInfo.tags,
          exif: exifData,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          type: 'image',
          source: 'library',
          libraryMount: mount.name,
          libraryPath: rel,
        }
      } catch (err) {
        log().warn(`Failed to process library image ${absFile}:`, err)
        return null
      }
    }

    // video
    try {
      const probe = await probeVideo(absFile)
      const durationSec = probe?.duration || 0
      let frame = await extractVideoFrame(absFile, durationSec)
      let thumbnailBuffer: Buffer | null = null
      let thumbnailHash: any = null
      let width: number | null = probe?.width || null
      let height: number | null = probe?.height || null

      if (frame) {
        try {
          const { thumbnailBuffer: tb, thumbnailHash: th } =
            await generateThumbnailAndHash(frame)
          thumbnailBuffer = tb
          thumbnailHash = th
        } catch {
          // fallback: use raw frame
          thumbnailBuffer = frame
        }
      }

      let written: string | null = null
      if (thumbnailBuffer) {
        written = await writeThumbnailInPlace(thumbnailBuffer)
      }

      const dbWidth = width || null
      const dbHeight = height || null

      return {
        title: path.basename(rel, path.extname(rel)),
        description: '',
        width: dbWidth,
        height: dbHeight,
        aspectRatio:
          dbWidth && dbHeight && dbHeight > 0 ? dbWidth / dbHeight : 16 / 9,
        dateTaken: stat.mtime.toISOString(),
        storageKey: `${mount.name}/${rel}`,
        thumbnailKey: written || null,
        fileSize: stat.size,
        lastModified: stat.mtime.toISOString(),
        originalUrl,
        thumbnailUrl: written ? thumbnailPublicUrl : null,
        thumbnailHash: thumbnailHash ? compressUint8Array(thumbnailHash) : null,
        tags: ['video'],
        exif: null,
        type: 'video',
        source: 'library',
        libraryMount: mount.name,
        libraryPath: rel,
      }
    } catch (err) {
      log().warn(`Failed to process library video ${absFile}:`, err)
      return null
    }
  }
}

export const libraryScanner = new LibraryScanner()

export type { LibraryConfig, LibraryMount }