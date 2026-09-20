import path from 'node:path'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { and, count, eq, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { useDB, tables } from '~~/server/utils/db'
import { applyScanAlbumMeta, getScanAlbumMeta } from './album-meta'
import { scanLibraries } from '~~/server/database/schema'
import {
  type LibraryMount,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  DEFAULT_LIBRARY_PHOTOS,
  DEFAULT_LIBRARY_VIDEOS,
} from '../library/config'

/**
 * 本地扫描库（独立存储方式）
 *
 * 与「上传加密 blob 存储」完全分离：把明文照片/视频丢进某一文件夹即被自动监控、
 * 自动生成缩略图。原图只读引用该文件夹（通过 /library/<mount>/... 访问），
 * 缩略图写入当前 blob 存储后端（与上传共用，但两者互不混淆）。
 */

export interface ScanLibrary {
  id: number
  name: string
  /** 公开相簿 URL 标识（自定义 slug 存在时其优先级更高） */
  urlKey: string | null
  rootPath: string
  provider: 'local'
  enabled: boolean
  /** 是否以「相簿」形式在相册页展示（同时从首页全局画廊隐藏） */
  asAlbum: boolean
  watchIntervalMs: number
  lastScanAt: string | null
  lastScanResult: string | null
  /** 该扫描库已入索引的照片/视频数量 */
  photoCount: number
  /** 最近一次被禁用的时间（ISO 字符串）；未禁用时为 null */
  disabledAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** 创建/更新扫描库的输入（根路径必填，name 可服务端依据路径生成） */
export const scanLibraryInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  rootPath: z.string().trim().min(1).max(1024),
  enabled: z.boolean().optional(),
  asAlbum: z.boolean().optional(),
  watchIntervalMs: z.number().int().min(5000).max(3600000).optional(),
})
export type ScanLibraryInput = z.infer<typeof scanLibraryInputSchema>

/** 挂载名前缀：scan_<id> */
export const scanMountName = (id: number | string) => `scan_${id}`
const scanMountId = (name: string): number | null =>
  name.startsWith('scan_') ? Number(name.slice(5)) || null : null
export const isScanMountName = (name: string) => scanMountId(name) !== null

/**
 * 由 id 推导唯一 urlKey：sha256(id) 短前缀（形如 a1b2c3d4，类似 git 提交 hash）。
 * 确定性映射：同一 id 永远得到同一 key，天然无碰撞（id 唯一），无需随机。
 */
export const scanUrlKeyOfId = (id: number): string =>
  createHash('sha256').update(String(id)).digest('hex').slice(0, 8)

/** 依据 id 确定性生成 urlKey（存库持久化，供按 key 反查） */
const generateUrlKeyById = (id: number): string => scanUrlKeyOfId(id)

const unionMediaExtensions = (): Set<string> => {
  const s = new Set<string>()
  for (const e of IMAGE_EXTENSIONS) s.add(e)
  for (const e of VIDEO_EXTENSIONS) s.add(e)
  return s
}

/** 相对路径/名称清理 */
const cleanName = (s: string) =>
  (s || '').trim().replace(/[\\/]+$/, '').replace(/^[\\/]+/, '')

/** 环境变量回退挂载（兼容旧行为 /app/photos、/app/videos） */
const envFallbackMounts = (): LibraryMount[] => {
  const cfg = useRuntimeConfig() as any
  const runtime = cfg?.library || {}
  const photosRoot = path.resolve(
    (runtime.photosPath || process.env.LIBRARY_PHOTOS_PATH || '').trim() ||
      DEFAULT_LIBRARY_PHOTOS,
  )
  const videosRoot = path.resolve(
    (runtime.videosPath || process.env.LIBRARY_VIDEOS_PATH || '').trim() ||
      DEFAULT_LIBRARY_VIDEOS,
  )
  return [
    {
      name: 'photos',
      type: 'image',
      root: photosRoot,
      extensions: IMAGE_EXTENSIONS,
      routePrefix: '/library/photos',
    },
    {
      name: 'videos',
      type: 'video',
      root: videosRoot,
      extensions: VIDEO_EXTENSIONS,
      routePrefix: '/library/videos',
    },
  ]
}

/** 读取全部（含禁用）扫描库原始行 */
export const listRawScanLibraries = (): Array<typeof scanLibraries.$inferSelect> => {
  const db = useDB()
  return db
    .select()
    .from(scanLibraries)
    .orderBy(scanLibraries.id)
    .all()
}

/** 为缺失 url_key（或与 id 推导不符）的存量扫描库补齐持久化，返回受影响行数 */
const backfillScanLibraryUrlKeys = (): number => {
  const db = useDB()
  let updated = 0
  for (const row of listRawScanLibraries()) {
    const expect = generateUrlKeyById(row.id)
    if (row.urlKey === expect) continue
    db.update(scanLibraries)
      .set({ urlKey: expect, updatedAt: new Date() })
      .where(eq(scanLibraries.id, row.id))
      .run()
    updated++
  }
  if (updated > 0) invalidateLibraryMountsCache()
  return updated
}

/** 读取全部扫描库（含 photoCount 统计与状态字段） */
export const listScanLibraries = async (): Promise<ScanLibrary[]> => {
  backfillScanLibraryUrlKeys()
  const rows = listRawScanLibraries()
  const db = useDB()
  // 单条聚合查询一次取回所有扫描库的索引照片数，避免 N+1 计数
  const counts = db
    .select({
      mount: tables.photos.libraryMount,
      c: count(),
    })
    .from(tables.photos)
    .where(eq(tables.photos.source, 'library'))
    .groupBy(tables.photos.libraryMount)
    .all()
  const countByMount = new Map(counts.map((r) => [r.mount, r.c]))
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    urlKey: row.urlKey,
    rootPath: row.rootPath,
    provider: 'local',
    enabled: row.enabled,
    asAlbum: row.asAlbum,
    watchIntervalMs: row.watchIntervalMs,
    lastScanAt: row.lastScanAt ? new Date(row.lastScanAt).toISOString() : null,
    lastScanResult: row.lastScanResult,
    photoCount: countByMount.get(scanMountName(row.id)) ?? 0,
    disabledAt: row.disabledAt ? new Date(row.disabledAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  }))
}

/** 进程内缓存：已启用扫描库 → 挂载集合（缩略图热路径避免每次请求都查库） */
let cachedMounts: LibraryMount[] | null = null

/**
 * 进程内「临时不可用」的外部库挂载名集合。
 *
 * 用途：当指定扫描库的根目录在一次扫描中被判定为不存在（目录被删除/卸载/失去权限）
 * 时，将其挂载名记入本集合。这样画廊首页、相册页、以及 /library/<mount>/... 图片路由
 * （它们都经由 getLibraryMounts() 取挂载集合）会立即隐藏整库，避免展示出点击后必然
 * 加载失败的失效缩略图。恢复后该挂载会被扫描成功流程移出集合、自动回归。
 *
 * 该状态仅存在内存中，不落库：目录可用性是运行时状态，重启进程后由下次扫描重新判定。
 */
const unavailableScanMounts = new Set<string>()

/** 把指定挂载名标记为「临时不可用」（目录不可访问），并让挂载集合缓存失效 */
export const markScanMountUnavailable = (mountName: string): void => {
  if (!mountName) return
  unavailableScanMounts.add(mountName)
  invalidateLibraryMountsCache()
}

/** 把指定挂载名标记为「可用」（目录已恢复访问），并让挂载集合缓存失效 */
export const unmarkScanMountUnavailable = (mountName: string): void => {
  if (!mountName) return
  unavailableScanMounts.delete(mountName)
  invalidateLibraryMountsCache()
}

/** 判断指定挂载名当前是否被判定为临时不可用 */
export const isScanMountUnavailable = (mountName: string): boolean =>
  unavailableScanMounts.has(mountName)

/** 使 getLibraryMounts 缓存失效（在扫描库新增/更新/删除后调用） */
export const invalidateLibraryMountsCache = (): void => {
  cachedMounts = null
}

/** 构建全量 enabled 挂载集合（含当前判定不可用者），不参与画廊展示过滤 */
const buildLibraryMounts = (): LibraryMount[] => {
  const enabled = listRawScanLibraries().filter((r) => r.enabled)
  return enabled.length === 0
    ? envFallbackMounts()
    : enabled.map<LibraryMount>((row) => ({
    name: scanMountName(row.id),
    type: 'image', // 类型改为按单个文件扩展名判定（见 scanner.processFile）
    root: path.resolve(row.rootPath),
    extensions: unionMediaExtensions(),
    routePrefix: `/library/${scanMountName(row.id)}`,
  }))
}

/**
 * 构建供画廊展示的 active 挂载集合：优先使用已启用的扫描库；
 * 无启用扫描库时回退到环境变量目录。
 * 目录缺席的挂载会立即从本集合剔除，使画廊/相册/图片路由隐藏整库（见 markScanMountUnavailable）。
 */
export const getLibraryMounts = (): LibraryMount[] => {
  if (cachedMounts) return cachedMounts
  const mounts = buildLibraryMounts()
  const available = mounts.filter((m) => !unavailableScanMounts.has(m.name))
  cachedMounts = available
  return available
}

/**
 * 供扫描器使用：返回全量 enabled 挂载（含当前判定为「临时不可用」者）。
 * 扫描循环需要继续探测 unavailable 挂载，以便目录恢复访问时 unmark 并让整库自动回归画廊；
 * 若直接用 getLibraryMounts()（已过滤）则不可用挂载永远不会被再次探测、无法恢复。
 */
export const getAllScalableMounts = (): LibraryMount[] => buildLibraryMounts()

/** 新增扫描库并返回其 id */
export const createScanLibrary = async (input: ScanLibraryInput): Promise<number> => {
  const db = useDB()
  const name =
    cleanName(input.name) || path.basename(path.resolve(input.rootPath))
  const res = db
    .insert(scanLibraries)
    .values({
      name,
      rootPath: path.resolve(input.rootPath),
      provider: 'local',
      // urlKey 由自增 id 导入后推导（sha256(id) 前 8 位）
      enabled: input.enabled ?? true,
      asAlbum: input.asAlbum ?? false,
      watchIntervalMs: input.watchIntervalMs ?? 60000,
    })
    .returning({ id: scanLibraries.id })
    .get()
  // 依据 id 确定性生成并持久化 urlKey，供按 key 反查
  db.update(scanLibraries)
    .set({ urlKey: generateUrlKeyById(res.id), updatedAt: new Date() })
    .where(eq(scanLibraries.id, res.id))
    .run()
  invalidateLibraryMountsCache()
  return res.id
}

/** 更新扫描库 */
export const updateScanLibrary = async (
  id: number,
  input: ScanLibraryInput,
): Promise<boolean> => {
  const db = useDB()
  const patch: Partial<ScanLibraryInput> = {}
  if (input.rootPath !== undefined) patch.rootPath = path.resolve(input.rootPath)
  if (input.name !== undefined && (input.name as string).trim())
    patch.name = (input.name as string).trim()
  if (input.enabled !== undefined) patch.enabled = input.enabled
  if (input.asAlbum !== undefined) patch.asAlbum = input.asAlbum
  if (input.watchIntervalMs !== undefined) patch.watchIntervalMs = input.watchIntervalMs
  const colPatch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'rootPath') colPatch.rootPath = v
    else if (k === 'name') colPatch.name = v
    else if (k === 'enabled') colPatch.enabled = v
    else if (k === 'asAlbum') colPatch.asAlbum = v
    else if (k === 'watchIntervalMs') colPatch.watchIntervalMs = v
  }

  // 维护「最近禁用时间」：禁用时写入当前时间，恢复启用时清空；
  // 供「禁用超 7 天未恢复则自动清理其遗留缩略图」的逻辑判断。
  if (patch.enabled !== undefined) {
    const row = getScanLibraryRow(id)
    const wasEnabled = row?.enabled
    const nowEnabled = patch.enabled
    if (wasEnabled && !nowEnabled) {
      colPatch.disabledAt = new Date()
    } else if (!wasEnabled && nowEnabled) {
      colPatch.disabledAt = null
    }
  }

  // 密码已下沉到「相簿」级别（scan_album_meta.password_hash），此处不再处理库级密码
  if (Object.keys(colPatch).length === 0) return false
  await db
    .update(scanLibraries)
    .set({ ...colPatch, updatedAt: new Date() })
    .where(eq(scanLibraries.id, id))
    .run()
  invalidateLibraryMountsCache()
  return true
}

/** 删除扫描库（同时删除其 source='library' 的记录，因为这些条目已失去文件源） */
export const deleteScanLibrary = async (id: number): Promise<boolean> => {
  const db = useDB()
  const mount = scanMountName(id)

  // 同步清理该库就地生成的缩略图文件（<mountRoot>/thumbnails/<id>.webp），
  // 避免删除外部库后遗留孤儿缩略图占磁盘空间。
  const row = getScanLibraryRow(id)
  if (row) {
    const thumbnails = db
      .select({ key: tables.photos.thumbnailKey })
      .from(tables.photos)
      .where(
        and(
          eq(tables.photos.source, 'library'),
          eq(tables.photos.libraryMount, mount),
        ),
      )
      .all()
    const root = path.resolve(row.rootPath)
    for (const t of thumbnails) {
      if (!t.key) continue
      const abs = path.resolve(root, t.key)
      if (!abs.startsWith(path.resolve(root) + path.sep)) continue
      try {
        await fs.unlink(abs)
        await fs.rmdir(path.dirname(abs)).catch(() => {})
      } catch (err) {
        // 缩略图文件删除失败不阻塞库删除，仅告警
        logger.dynamic('scan-library').warn(
          `Failed to remove thumbnail ${abs}:`,
          err,
        )
      }
    }
  }

  await db.delete(tables.photos).where(eq(tables.photos.libraryMount, mount)).run()
  await db.delete(scanLibraries).where(eq(scanLibraries.id, id)).run()
  invalidateLibraryMountsCache()
  return true
}

/** 写入一次扫描结果（供 scanMount 结束后调用） */
export const recordScanResult = (
  mountName: string,
  result: { indexed: number; updated: number; failed: number },
): void => {
  const id = scanMountId(mountName)
  if (id === null) return
  const db = useDB()
  const summary = `indexed=${result.indexed} updated=${result.updated} failed=${result.failed}`
  db.update(scanLibraries)
    .set({ lastScanAt: new Date(), lastScanResult: summary, updatedAt: new Date() })
    .where(eq(scanLibraries.id, id))
    .run()
}

/** 当前启用的扫描库轮询间隔最小值（用于驱动自动监控节奏） */
export const getMinWatchIntervalMs = (): number | null => {
  const enabled = listRawScanLibraries().filter((r) => r.enabled)
  if (enabled.length === 0) return null
  return Math.min(...enabled.map((r) => r.watchIntervalMs))
}

// ---------------------------------------------------------------------------
// 扫描库 → 相簿
// ---------------------------------------------------------------------------

/** 只读单条扫描库行 */
export const getScanLibraryRow = (
  id: number,
): (typeof scanLibraries.$inferSelect) | null => {
  const db = useDB()
  const row = db
    .select()
    .from(scanLibraries)
    .where(eq(scanLibraries.id, id))
    .get()
  return row ?? null
}

/**
 * 按公开 URL 标识解析扫描库行。
 * 优先匹配 urlKey（base36 时间戳），其次兼容存量数字 id 链接。
 */
export const getScanLibraryByKey = (
  key: string,
): (typeof scanLibraries.$inferSelect) | null => {
  const db = useDB()
  const cleaned = (key || '').trim()
  if (!cleaned) return null
  backfillScanLibraryUrlKeys()
  const byUrl = db
    .select()
    .from(scanLibraries)
    .where(eq(scanLibraries.urlKey, cleaned))
    .get()
  if (byUrl) return byUrl
  if (/^\d+$/.test(cleaned)) return getScanLibraryRow(Number(cleaned))
  return null
}

/**
 * 计算某相簿（含其上级）生效的相簿访问密码哈希。
 * 自身 meta 优先；未单独设置则向上继承最近一级；均无密码时返回 null（开放相簿）。
 * 密码仅存于相簿级别（scan_album_meta.password_hash），与扫描库级无关。
 */
export const getScanAlbumEffectivePasswordHash = async (
  libId: number,
  relPath: string,
): Promise<string | null> => {
  const lib = getScanLibraryRow(libId)
  if (!lib) return null
  const mount = scanMountName(libId)
  // 从自身向根逐级（deepest → shallowest）查找带密码的 meta
  const segs = relPath.split('/').filter(Boolean)
  const deepToRoot: string[] = []
  let acc = ''
  segs.forEach((s) => {
    acc = acc ? `${acc}/${s}` : s
    deepToRoot.push(acc)
  })
  deepToRoot.reverse() // ['a/b','a', ...] → 最深在前
  deepToRoot.push('') // 根
  for (const p of deepToRoot) {
    const meta = await getScanAlbumMeta(mount, p)
    if (meta?.passwordHash) return meta.passwordHash
  }
  // 密码仅存在于相簿级别（scan_album_meta.password_hash）；无相簿密码即视为开放
  return null
}

/** 以「相簿」展示且启用的扫描库挂载名集合（如 scan_1），用于从首页全局画廊隐藏 */
export const getAlbumScanMountSet = (): Set<string> => {
  const db = useDB()
  const rows = db
    .select({ id: scanLibraries.id })
    .from(scanLibraries)
    .where(
      and(eq(scanLibraries.asAlbum, true), eq(scanLibraries.enabled, true)),
    )
    .all()
  return new Set(rows.map((r) => scanMountName(r.id)))
}

/**
 * 应从首页全局画廊隐藏的扫描库挂载名集合。
 * 包含两类：
 * 1) 转为相簿展示的库（asAlbum=true，照片只在相册页展示）；
 * 2) 已被禁用/停止的库（enabled=false，外部库不再可用，其缩略图应立即从画廊隐藏，
 *    避免"关闭了还在首页显示"），删除的库则由 deleteScanLibrary 直接清理 DB 记录。
 */
export const getGalleryHiddenScanMountSet = (): Set<string> => {
  const db = useDB()
  const rows = db
    .select({ id: scanLibraries.id })
    .from(scanLibraries)
    .where(
      or(
        eq(scanLibraries.asAlbum, true),
        eq(scanLibraries.enabled, false),
      ),
    )
    .all()
  return new Set(rows.map((r) => scanMountName(r.id)))
}

/**
 * 返回所有「已禁用」扫描库的挂载名集合（enabled=false）。
 *
 * 用途：被禁用的外部库，其原图/缩略图路由（/library/<mount>/...）已不再提供
 * （挂载被 getLibraryMounts() 剔除），因此其照片不能在任何公开视图出现，
 * 否则点击会命中加载失败的坏图。首页画廊已用 getGalleryHiddenScanMountSet()
 * 过滤；相册等其余数据源需单独基于本集合过滤「仅禁用」的库（转为相簿但保持启用的
 * 库应继续在相册内可见，故不能直接用 getGalleryHiddenScanMountSet）。
 */
export const getDisabledScanMountSet = (): Set<string> => {
  const db = useDB()
  const rows = db
    .select({ id: scanLibraries.id })
    .from(scanLibraries)
    .where(eq(scanLibraries.enabled, false))
    .all()
  return new Set(rows.map((r) => scanMountName(r.id)))
}

export interface ScanAlbumCover {
  id: string
  thumbnailUrl: string | null
  thumbnailHash: string | null
  aspectRatio: number | null
}

/** 扫描相簿节点（顶层相簿或嵌套子相簿），用于相册页展示 */
export interface ScanAlbumNode {
  kind: 'scan'
  libId: number
  /** 挂载名（如 scan_12），用于定位元数据 */
  mount: string
  /** '' 表示库根；子目录为相对路径，如 'sub/dir' */
  relPath: string
  title: string
  /** 扫描库登记的创建时间（ISO 字符串） */
  createdAt: string | null
  /** 展示用的介绍文字（自定义元数据或 null） */
  description: string | null
  /** 公开 URL 标识：sha256 短前缀（形如 a1b2c3d4）；未持久化时为 null */
  urlKey: string | null
  link: string
  /** 照片展示布局：瀑布流 / 统一网格 / 沉浸式看图（自定义元数据可覆盖节点默认） */
  layout: 'waterfall' | 'grid' | 'immersive' | 'timeline'
  /** 该层目录直接包含的照片数（不含更深的子目录） */
  photoCount: number
  coverPhotoId: string | null
  covers: ScanAlbumCover[]
  passwordProtected: boolean
  /** 相簿访问密码明文（仅管理端回显；公开返回前会被剥离） */
  password?: string | null
  hasChildren: boolean
  /** 是否为外部库（扫描库）相簿：始终为 true */
  external: boolean
  /** 是否在前台相册列表隐藏（有自定义隐藏设置时为 true） */
  isHidden?: boolean
  /** 自定义URL别名（有设置时公开链接使用 /albums/s/{slug}） */
  slug?: string | null
  /** 是否存在自定义元数据覆盖 */
  hasCustom?: boolean
  /** 嵌套子相簿（用于管理端树状展示） */
  children?: ScanAlbumNode[]
}

const dirOfScanPath = (rel: string): string => {
  const idx = rel.lastIndexOf('/')
  return idx === -1 ? '' : rel.slice(0, idx)
}

/** 计算 relPath 目录的直接子目录名 */
const childSegmentsOf = (
  mount: string,
  relPath: string,
  photos: Array<typeof tables.photos.$inferSelect>,
): string[] => {
  const segs = new Set<string>()
  const prefix = relPath ? `${relPath}/` : ''
  for (const p of photos) {
    if (p.libraryMount !== mount) continue
    const dir = dirOfScanPath(p.libraryPath || '')
    if (dir === relPath || !dir.startsWith(prefix)) continue
    const rest = dir.slice(prefix.length)
    const seg = rest.split('/')[0]
    if (seg) segs.add(seg)
  }
  return Array.from(segs)
}

const buildScanAlbumNode = (
  lib: {
    id: number
    name: string
    urlKey: string | null
    createdAt?: Date | null
  },
  relPath: string,
  photos: Array<typeof tables.photos.$inferSelect>,
): ScanAlbumNode => {
  const mount = scanMountName(lib.id)
  const dirPhotos = photos.filter(
    (p) => p.libraryMount === mount && dirOfScanPath(p.libraryPath || '') === relPath,
  )
  dirPhotos.sort((a, b) =>
    (a.dateTaken || '').localeCompare(b.dateTaken || ''),
  )
  const covers: ScanAlbumCover[] = dirPhotos.slice(0, 3).map((p) => ({
    id: p.id,
    thumbnailUrl: p.thumbnailUrl,
    thumbnailHash: p.thumbnailHash,
    aspectRatio: p.aspectRatio,
  }))
  const seg = relPath.split('/').filter(Boolean).pop()
  const title = relPath === '' ? lib.name : decodeURIComponent(seg || relPath)
  // 公开链接优先使用 urlKey（base36 时间戳），回退到数字 id 兼容存量
  const key = lib.urlKey || String(lib.id)
  const link =
    `/albums/scan/${key}` +
    (relPath
      ? '/' + relPath.split('/').map((s) => encodeURIComponent(s)).join('/')
      : '')
  return {
    kind: 'scan',
    libId: lib.id,
    mount,
    relPath,
    title,
    createdAt: lib.createdAt
      ? new Date(lib.createdAt instanceof Date ? lib.createdAt : new Date(lib.createdAt)).toISOString()
      : null,
    description: null,
    urlKey: lib.urlKey,
    link,
    layout: 'waterfall',
    photoCount: dirPhotos.length,
    coverPhotoId: covers[0]?.id ?? null,
    covers,
    // 相簿级密码由 applyScanAlbumMeta 依据 scan_album_meta.password_hash 覆盖
    passwordProtected: false,
    hasChildren: childSegmentsOf(mount, relPath, photos).length > 0,
    external: true,
  }
}

/** 相册页顶层列表：返回所有「相簿」扫描库根节点。
 * @param includeChildren 管理端需要树状二级相簿时传 true，为根节点填充 children
 */
export const listScanAlbumRoots = async (
  includeChildren = false,
): Promise<ScanAlbumNode[]> => {
  const db = useDB()
  const rows = db
    .select()
    .from(scanLibraries)
    .where(and(eq(scanLibraries.asAlbum, true), eq(scanLibraries.enabled, true)))
    .all()
  const out: ScanAlbumNode[] = []
  for (const row of rows) {
    const mount = scanMountName(row.id)
    const photos = db
      .select()
      .from(tables.photos)
      .where(
        and(
          eq(tables.photos.libraryMount, mount),
          isNull(tables.photos.deletedAt),
        ),
      )
      .all()
    const node = await applyScanAlbumMeta(
      buildScanAlbumNode(row, '', photos),
      photos,
    )
    if (includeChildren) {
      node.children = await buildScanAlbumTree(
        row,
        '',
        photos,
        node.isHidden,
        node.passwordProtected,
      )
    }
    out.push(node)
  }
  out.sort((a, b) => a.title.localeCompare(b.title))
  return out
}

/**
 * 递归构建某目录层的完整子相簿树（已应用元数据）。
 * 子相簿默认不单独设配置，继承其主相簿（所属扫描库）的隐藏状态；
 * 未单独自定义的子相簿会继承主相簿的 isHidden 状态。密码同样在相簿级别继承。
 * @param parentHidden 主相簿的隐藏状态；未单独自定义的子相簿继承它
 */
const buildScanAlbumTree = async (
  lib: {
    id: number
    name: string
    urlKey: string | null
    createdAt?: Date | null
  },
  relPath: string,
  photos: Array<typeof tables.photos.$inferSelect>,
  parentHidden?: boolean,
  parentPasswordProtected = false,
): Promise<ScanAlbumNode[]> => {
  const segs = childSegmentsOf(scanMountName(lib.id), relPath, photos).sort()
  const nodes: ScanAlbumNode[] = []
  for (const seg of segs) {
    const childRel = relPath ? `${relPath}/${seg}` : seg
    const childNode = await applyScanAlbumMeta(
      buildScanAlbumNode(lib, childRel, photos),
      photos,
    )
    // 未单独自定义隐藏的子相簿继承主相簿隐藏状态
    if (parentHidden && childNode.hasCustom !== true) {
      childNode.isHidden = true
    }
    // 未单独设置密码的子相簿继承父级加密状态
    if (parentPasswordProtected && !childNode.passwordProtected) {
      childNode.passwordProtected = true
    }
    const effectiveHidden = childNode.isHidden ?? parentHidden
    childNode.children = await buildScanAlbumTree(
      lib,
      childRel,
      photos,
      effectiveHidden,
      childNode.passwordProtected,
    )
    nodes.push(childNode)
  }
  return nodes
}

/** 单个扫描相簿详情（某目录层）：直接照片 + 嵌套子相簿 + 密码信息 */
export const getScanAlbumDetail = async (
  libId: number,
  relPath: string,
): Promise<{
  node: ScanAlbumNode
  dirPhotos: Array<{
    id: string
    title: string | null
    thumbnailUrl: string | null
    thumbnailHash: string | null
    aspectRatio: number | null
    originalUrl: string | null
    dateTaken: string | null
    isLivePhoto: number
    livePhotoVideoUrl: string | null
  }>
  children: ScanAlbumNode[]
} | null> => {
  const lib = getScanLibraryRow(libId)
  if (!lib || !lib.asAlbum || !lib.enabled) return null

  const normalized =
    relPath
      .split('/')
      .map((s) => decodeURIComponent(s))
      .filter((s) => s && s !== '.' && s !== '..')
      .join('/') || ''
  const db = useDB()
  const mount = scanMountName(libId)
  const photos = db
    .select()
    .from(tables.photos)
    .where(
      and(
        eq(tables.photos.libraryMount, mount),
        isNull(tables.photos.deletedAt),
      ),
    )
    .all()

  const node = await applyScanAlbumMeta(
    buildScanAlbumNode(lib, normalized, photos),
    photos,
  )
  const dirPhotos = photos
    .filter(
      (p) => dirOfScanPath(p.libraryPath || '') === normalized,
    )
    .sort((a, b) => {
      // 优先按拍摄时间升序；无拍摄时间（扫描照片常缺 EXIF 日期）时回退按文件名升序，
      // 避免落到数据库的任意顺序而显得"排序乱掉了"。
      const ta = a.dateTaken ?? ''
      const tb = b.dateTaken ?? ''
      if (ta || tb) {
        const byDate = ta.localeCompare(tb)
        if (byDate !== 0) return byDate
      }
      return (a.title ?? a.libraryPath ?? '').localeCompare(b.title ?? b.libraryPath ?? '')
    })
    .map((p) => ({
      id: p.id,
      title: p.title,
      thumbnailUrl: p.thumbnailUrl,
      thumbnailHash: p.thumbnailHash,
      aspectRatio: p.aspectRatio,
      originalUrl: p.originalUrl,
      dateTaken: p.dateTaken,
      isLivePhoto: p.isLivePhoto,
      livePhotoVideoUrl: p.livePhotoVideoUrl,
    }))

  const children: ScanAlbumNode[] = await Promise.all(
    childSegmentsOf(mount, normalized, photos)
      .sort((a, b) => a.localeCompare(b))
      .map(async (seg) => {
        const childRel = normalized ? `${normalized}/${seg}` : seg
        const childNode = await applyScanAlbumMeta(
          buildScanAlbumNode(lib, childRel, photos),
          photos,
        )
        childNode.children = await buildScanAlbumTree(
          lib,
          childRel,
          photos,
          node.isHidden ?? childNode.isHidden,
          childNode.passwordProtected,
        )
        return childNode
      }),
  )

  return { node, dirPhotos, children }
}

// ---------------------------------------------------------------------------
// 禁用后超期未恢复的扫描库自动清理
// ---------------------------------------------------------------------------

/**
 * 清理「被禁用且超过 graceDays 未恢复启用」的扫描库：
 * 删除其就地生成的缩略图文件、source='library' 的照片记录，以及扫描库配置行。
 *
 * 设计背景：外部库被"关闭/停止/删除"后，其缩略图应立即从前台隐藏（由
 * getGalleryHiddenScanMountSet 处理），但为给用户留出"误操作恢复"的缓冲，
 * 磁盘上的缩略图会保留一段时间。本函数在恢复缓冲期（默认 7 天）过后，
 * 彻底清理该库遗留的缩略图文件与数据库记录，避免无限期占用空间。
 *
 * @param graceDays 恢复缓冲天数，超过该时间仍未重新启用则自动清理；默认 7
 * @returns 本次实际清理的扫描库数量
 */
export const cleanupExpiredDisabledScanLibraries = async (
  graceDays = 7,
): Promise<number> => {
  const db = useDB()
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000)

  const expired = db
    .select()
    .from(scanLibraries)
    .where(
      and(
        eq(scanLibraries.enabled, false),
        isNotNull(scanLibraries.disabledAt),
        lt(scanLibraries.disabledAt, cutoff),
      ),
    )
    .all()

  if (expired.length === 0) return 0

  for (const row of expired) {
    const mount = scanMountName(row.id)
    // 删除磁盘缩略图文件
    const thumbnails = db
      .select({ key: tables.photos.thumbnailKey })
      .from(tables.photos)
      .where(
        and(
          eq(tables.photos.source, 'library'),
          eq(tables.photos.libraryMount, mount),
        ),
      )
      .all()
    const root = path.resolve(row.rootPath)
    for (const t of thumbnails) {
      if (!t.key) continue
      const abs = path.resolve(root, t.key)
      if (!abs.startsWith(path.resolve(root) + path.sep)) continue
      try {
        await fs.unlink(abs)
        await fs.rmdir(path.dirname(abs)).catch(() => {})
      } catch (err) {
        logger.dynamic('scan-library').warn(
          `(cleanup) Failed to remove thumbnail ${abs}:`,
          err,
        )
      }
    }
    // 删除已有缩略图的照片记录与库配置行
    await db
      .delete(tables.photos)
      .where(eq(tables.photos.libraryMount, mount))
      .run()
    await db
      .delete(scanLibraries)
      .where(eq(scanLibraries.id, row.id))
      .run()
    logger
      .dynamic('scan-library')
      .info(
        `(cleanup) Purged disabled scan library #${row.id} "${row.name}" (disabled > ${graceDays}d, not recovered)`,
      )
  }

  invalidateLibraryMountsCache()
  return expired.length
}

