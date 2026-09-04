import path from 'node:path'
import { and, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDB, tables } from '~~/server/utils/db'
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
  rootPath: string
  provider: 'local'
  enabled: boolean
  watchIntervalMs: number
  lastScanAt: string | null
  lastScanResult: string | null
  /** 该扫描库已入索引的照片/视频数量 */
  photoCount: number
  createdAt: string | null
  updatedAt: string | null
}

/** 创建/更新扫描库的输入（根路径必填，name 可服务端依据路径生成） */
export const scanLibraryInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  rootPath: z.string().trim().min(1).max(1024),
  enabled: z.boolean().optional(),
  watchIntervalMs: z.number().int().min(5000).max(3600000).optional(),
})
export type ScanLibraryInput = z.infer<typeof scanLibraryInputSchema>

/** 挂载名前缀：scan_<id> */
export const scanMountName = (id: number | string) => `scan_${id}`
const scanMountId = (name: string): number | null =>
  name.startsWith('scan_') ? Number(name.slice(5)) || null : null
export const isScanMountName = (name: string) => scanMountId(name) !== null

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

/** 读取全部扫描库（含 photoCount 统计与状态字段） */
export const listScanLibraries = async (): Promise<ScanLibrary[]> => {
  const rows = listRawScanLibraries()
  const db = useDB()
  const out: ScanLibrary[] = []
  for (const row of rows) {
    const counted = db
      .select({ c: count() })
      .from(tables.photos)
      .where(
        and(
          eq(tables.photos.source, 'library'),
          eq(tables.photos.libraryMount, scanMountName(row.id)),
        ),
      )
      .all()
    const photoCount = counted[0]?.c ?? 0
    out.push({
      id: row.id,
      name: row.name,
      rootPath: row.rootPath,
      provider: 'local',
      enabled: row.enabled,
      watchIntervalMs: row.watchIntervalMs,
      lastScanAt: row.lastScanAt ? new Date(row.lastScanAt).toISOString() : null,
      lastScanResult: row.lastScanResult,
      photoCount,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    })
  }
  return out
}

/** 构建 active 挂载集合：优先使用已启用的扫描库；无启用扫描库时回退到环境变量目录 */
export const getLibraryMounts = (): LibraryMount[] => {
  const enabled = listRawScanLibraries().filter((r) => r.enabled)
  if (enabled.length === 0) return envFallbackMounts()
  return enabled.map<LibraryMount>((row) => ({
    name: scanMountName(row.id),
    type: 'image', // 类型改为按单个文件扩展名判定（见 scanner.processFile）
    root: path.resolve(row.rootPath),
    extensions: unionMediaExtensions(),
    routePrefix: `/library/${scanMountName(row.id)}`,
  }))
}

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
      enabled: input.enabled ?? true,
      watchIntervalMs: input.watchIntervalMs ?? 60000,
    })
    .returning({ id: scanLibraries.id })
    .get()
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
  if (input.watchIntervalMs !== undefined) patch.watchIntervalMs = input.watchIntervalMs
  if (Object.keys(patch).length === 0) return false
  await db
    .update(scanLibraries)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(scanLibraries.id, id))
    .run()
  return true
}

/** 删除扫描库（同时删除其 source='library' 的记录，因为这些条目已失去文件源） */
export const deleteScanLibrary = async (id: number): Promise<boolean> => {
  const db = useDB()
  await db.delete(tables.photos).where(eq(tables.photos.libraryMount, scanMountName(id))).run()
  await db.delete(scanLibraries).where(eq(scanLibraries.id, id)).run()
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

