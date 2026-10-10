import path from 'node:path'
import { createHash } from 'node:crypto'
import { and, count, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { useDB, tables } from '~~/server/utils/db'
import {
  getGlobalStorageManager,
} from '~~/server/services/storage/events'
import { applyScanAlbumMeta, getScanAlbumMeta } from './album-meta'
import { scanLibraries } from '~~/server/database/schema'
import {
  type LibraryMount,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from '../library/config'

/**
 * 本地扫描库（独立存储方式）
 *
 * 与「上传加密 blob 存储」完全分离：把明文照片/视频丢进某一文件夹即被自动监控、
 * 自动生成缩略图。原图只读引用该文件夹（通过 /library/<mount>/... 访问），
 * 缩略图写入当前 blob 存储后端（与上传共用，但两者互不混淆）。
 *
 * 注意：不再存在「内置媒体库」兜底挂载。本程序只有两类照片来源——
 *   1) 上传加密照片：实时写入本地存储（/app/storage），立即展示、无需扫描。
 *   2) 外部扫描库：用户显式添加的挂载目录才被自动识别（大小写见 buildLibraryMounts）。
 * 因此 buildLibraryMounts 不再回退到 /app/photos、/app/videos 等内置路径，
 * 避免把纯存储目录（/app/storage）误当作相册扫描显示。
 */

export interface ScanLibrary {
  id: number
  name: string
  /** 公开相簿 URL 标识（自定义 slug 存在时其优先级更高） */
  urlKey: string | null
  rootPath: string
  provider: 'local'
  enabled: boolean
  /**
   * 展示方式（三态）：
   * - gallery：照片画廊（默认，首页全局画廊显示，不进相册页）
   * - album：相簿照片（相册页显示，首页全局画廊隐藏）
   * - both：共存（相册页显示 + 首页全局画廊也显示）
   */
  displayMode: 'gallery' | 'album' | 'both'
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
  displayMode: z.enum(['gallery', 'album', 'both']).optional(),
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
    displayMode: row.displayMode ?? 'gallery',
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

/** 构建全量 enabled 挂载集合（仅外部扫描库，不再包含内置兜底），含当前判定不可用者 */
const buildLibraryMounts = (): LibraryMount[] => {
  const enabled = listRawScanLibraries().filter((r) => r.enabled)
  return enabled.map<LibraryMount>((row) => ({
    name: scanMountName(row.id),
    type: 'image', // 类型改为按单个文件扩展名判定（见 scanner.processFile）
    root: path.resolve(row.rootPath),
    extensions: unionMediaExtensions(),
    routePrefix: `/library/${scanMountName(row.id)}`,
  }))
}

/**
 * 构建供画廊展示的 active 挂载集合：仅采用已启用的外部扫描库。
 * 已移除内置 photos/videos 兜底回退——纯存储目录（/app/storage）绝不会被当作相册扫描。
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
      displayMode: input.displayMode ?? 'gallery',
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
  if (input.displayMode !== undefined) patch.displayMode = input.displayMode
  if (input.watchIntervalMs !== undefined) patch.watchIntervalMs = input.watchIntervalMs
  const colPatch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'rootPath') colPatch.rootPath = v
    else if (k === 'name') colPatch.name = v
    else if (k === 'enabled') colPatch.enabled = v
    else if (k === 'displayMode') colPatch.displayMode = v
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

/**
 * 删除某扫描库对应的全部缩略图。
 * 缩略图统一由存储 provider 写入内部存储（key = thumbnails/<mount>/<id>.webp，含前缀），
 * 按存储 key 直接删除即可；provider.delete 对不存在的文件静默忽略，
 * 不再存在「就地生成」到挂载目录的情况。
 */
const removeLibraryThumbnails = async (
  mount: string,
  _rootPath: string,
  loc: string,
): Promise<void> => {
  const db = useDB()
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

  // 存储后端可能尚未初始化（如删除发生在引导早期），此时只尽力而为、不阻塞库删除
  const provider = getGlobalStorageManager()?.getProvider()
  for (const t of thumbnails) {
    if (!t.key || !provider) continue
    try {
      await provider.delete(t.key)
    } catch (err) {
      logger.dynamic('scan-library').warn(
        `${loc} Failed to remove thumbnail ${t.key}:`,
        err,
      )
    }
  }
}

/** 删除扫描库（同时删除其 source='library' 的记录，因为这些条目已失去文件源） */
export const deleteScanLibrary = async (id: number): Promise<boolean> => {
  const db = useDB()
  const mount = scanMountName(id)

  // 同步清理该库的缩略图（统一存于内部存储，按 key 删除），避免删除外部库后遗留孤儿缩略图占磁盘空间。
  const row = getScanLibraryRow(id)
  if (row) {
    await removeLibraryThumbnails(mount, row.rootPath, 'deleted')
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

/** 以「相簿」展示（album/both）且启用的扫描库挂载名集合（如 scan_1） */
export const getAlbumScanMountSet = (): Set<string> => {
  const db = useDB()
  const rows = db
    .select({ id: scanLibraries.id })
    .from(scanLibraries)
    .where(
      and(
        inArray(scanLibraries.displayMode, ['album', 'both']),
        eq(scanLibraries.enabled, true),
      ),
    )
    .all()
  return new Set(rows.map((r) => scanMountName(r.id)))
}

/**
 * 应从首页全局画廊隐藏的扫描库挂载名集合。
 * 包含两类：
 * 1) 纯相簿展示的库（displayMode='album'，照片只在相册页展示；
 *    共存 both 不隐藏，相册页与画廊同时展示）；
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
        eq(scanLibraries.displayMode, 'album'),
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
  /** 「随机一张照片」动画模式：default=直接打开 / wheel=3D轮盘 / compat=兼容动画 */
  randomAnimation: 'default' | 'wheel' | 'compat'
  /** 「随机照片轮经典语录」扩展功能是否开启 */
  randomQuotesEnabled: boolean
  /** 自定义语录（每行一条）；空=使用内置语录 */
  randomQuotes: string | null
  /** 「随机照片轮经典语录」标签来源：ancient=古诗语录 / modern=现代语录；null=未选（使用自定义） */
  randomQuotesTag: 'ancient' | 'modern' | null
  /** 相簿背景音乐（音乐盒）；null=不播放 BGM */
  bgmMusicId?: number | null
  /** 该层目录直接包含的图片数（不含更深的子目录；视频另计） */
  photoCount: number
  /** 该层目录直接包含的视频数（不含更深的子目录）；无视频时省略或为 0 */
  videoCount: number
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

/**
 * 扫描相簿树构建所需的最小照片列集合。
 * 关键优化：绝不能用 SELECT * —— photos 表带 exif/tags 两个 JSON 大字段，
 * 数万行全量反序列化会让相簿列表接口（每次保存/进页面都会调用）卡顿数秒以上。
 */
const scanPhotoColumns = {
  id: tables.photos.id,
  title: tables.photos.title,
  libraryMount: tables.photos.libraryMount,
  libraryPath: tables.photos.libraryPath,
  type: tables.photos.type,
  dateTaken: tables.photos.dateTaken,
  thumbnailUrl: tables.photos.thumbnailUrl,
  thumbnailHash: tables.photos.thumbnailHash,
  aspectRatio: tables.photos.aspectRatio,
  originalUrl: tables.photos.originalUrl,
  isLivePhoto: tables.photos.isLivePhoto,
  livePhotoVideoUrl: tables.photos.livePhotoVideoUrl,
}

type ScanPhotoRow = {
  id: string
  title: string | null
  libraryMount: string | null
  libraryPath: string | null
  type: 'image' | 'video' | null
  dateTaken: string | null
  thumbnailUrl: string | null
  thumbnailHash: string | null
  aspectRatio: number | null
  originalUrl: string | null
  isLivePhoto: number
  livePhotoVideoUrl: string | null
}

/** 一次构建、整棵树复用的照片索引：把各节点的 O(照片数) 过滤降为 O(1)/O(目录数) */
interface ScanPhotoIndex {
  byDir: Map<string, ScanPhotoRow[]>
  byId: Map<string, ScanPhotoRow>
}

const buildScanPhotoIndex = (
  mount: string,
  rows: ScanPhotoRow[],
): ScanPhotoIndex => {
  const byDir = new Map<string, ScanPhotoRow[]>()
  const byId = new Map<string, ScanPhotoRow>()
  for (const p of rows) {
    if (p.libraryMount !== mount) continue
    byId.set(p.id, p)
    const dir = dirOfScanPath(p.libraryPath || '')
    const arr = byDir.get(dir)
    if (arr) arr.push(p)
    else byDir.set(dir, [p])
  }
  return { byDir, byId }
}

/** 计算 relPath 目录的直接子目录名 */
const childSegmentsOf = (index: ScanPhotoIndex, relPath: string): string[] => {
  const segs = new Set<string>()
  const prefix = relPath ? `${relPath}/` : ''
  // 目录已按 dir 分组：只需遍历目录键（远少于照片数）
  for (const dir of index.byDir.keys()) {
    if (dir === relPath || !dir.startsWith(prefix)) continue
    const seg = dir.slice(prefix.length).split('/')[0]
    if (seg) segs.add(seg)
  }
  return Array.from(segs)
}

/** 稳定的伪随机索引：同 relPath 每次请求挑到同一张子相簿封面，避免刷新封面闪烁 */
const stableSeedOf = (s: string): number => {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return h
}

const buildScanAlbumNode = (
  lib: {
    id: number
    name: string
    urlKey: string | null
    createdAt?: Date | null
  },
  relPath: string,
  index: ScanPhotoIndex,
): ScanAlbumNode => {
  const mount = scanMountName(lib.id)
  const dirPhotos = [...(index.byDir.get(relPath) ?? [])]
  dirPhotos.sort((a, b) =>
    (a.dateTaken || '').localeCompare(b.dateTaken || ''),
  )
  const covers: ScanAlbumCover[] = dirPhotos
    // 封面仅取图片类型：视频文件通常无图片缩略图，避免封面空白
    .filter((p) => p.type !== 'video')
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      thumbnailUrl: p.thumbnailUrl,
      thumbnailHash: p.thumbnailHash,
      aspectRatio: p.aspectRatio,
    }))
  // 本层无直接图片（如只有子相簿）时：默认从后代子相簿照片中随机挑选一张作封面。
  // 仅作默认兜底，自定义封面会由 applyScanAlbumMeta 覆盖；同相簿稳定挑同一张避免刷新闪烁。
  // 目录分组后只需扫描目录键，每个后代目录取其首张非视频照片作为候选。
  const fallbackCovers: ScanAlbumCover[] = []
  if (covers.length === 0) {
    const prefix = relPath ? `${relPath}/` : ''
    const candidates: ScanPhotoRow[] = []
    for (const [dir, arr] of index.byDir) {
      if (dir === relPath || !dir.startsWith(prefix)) continue
      const rep = arr.find((p) => p.type !== 'video')
      if (rep) candidates.push(rep)
    }
    if (candidates.length > 0) {
      const pick =
        candidates[stableSeedOf(`${mount}:${relPath}`) % candidates.length]!
      fallbackCovers.push({
        id: pick.id,
        thumbnailUrl: pick.thumbnailUrl,
        thumbnailHash: pick.thumbnailHash,
        aspectRatio: pick.aspectRatio,
      })
    }
  }
  const effectiveCovers = covers.length > 0 ? covers : fallbackCovers
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
    randomAnimation: 'default',
    randomQuotesEnabled: true,
    randomQuotes: null,
    randomQuotesTag: null,
    photoCount: dirPhotos.filter((p) => p.type !== 'video').length,
    videoCount: dirPhotos.filter((p) => p.type === 'video').length,
    coverPhotoId: effectiveCovers[0]?.id ?? null,
    covers: effectiveCovers,
    // 相簿级密码由 applyScanAlbumMeta 依据 scan_album_meta.password_hash 覆盖
    passwordProtected: false,
    hasChildren: childSegmentsOf(index, relPath).length > 0,
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
    .where(
      and(
        inArray(scanLibraries.displayMode, ['album', 'both']),
        eq(scanLibraries.enabled, true),
      ),
    )
    .all()
  const out: ScanAlbumNode[] = []
  for (const row of rows) {
    const mount = scanMountName(row.id)
    // 只取树构建所需的最小列集，并按目录分组建索引一次复用
    const photos = db
      .select(scanPhotoColumns)
      .from(tables.photos)
      .where(
        and(
          eq(tables.photos.libraryMount, mount),
          isNull(tables.photos.deletedAt),
        ),
      )
      .all() as ScanPhotoRow[]
    const index = buildScanPhotoIndex(mount, photos)
    const node = await applyScanAlbumMeta(
      buildScanAlbumNode(row, '', index),
      index.byId,
    )
    if (includeChildren) {
      node.children = await buildScanAlbumTree(
        row,
        '',
        index,
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
  index: ScanPhotoIndex,
  parentHidden?: boolean,
  parentPasswordProtected = false,
): Promise<ScanAlbumNode[]> => {
  const segs = childSegmentsOf(index, relPath).sort()
  const nodes: ScanAlbumNode[] = []
  for (const seg of segs) {
    const childRel = relPath ? `${relPath}/${seg}` : seg
    const childNode = await applyScanAlbumMeta(
      buildScanAlbumNode(lib, childRel, index),
      index.byId,
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
      index,
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
  if (!lib || lib.displayMode === 'gallery' || !lib.enabled) return null

  const normalized =
    relPath
      .split('/')
      .map((s) => decodeURIComponent(s))
      .filter((s) => s && s !== '.' && s !== '..')
      .join('/') || ''
  const db = useDB()
  const mount = scanMountName(libId)
  // 只取最小列集 + 目录索引，避免大库全量反序列化 exif/tags 与逐节点 O(n) 过滤
  const photos = db
    .select(scanPhotoColumns)
    .from(tables.photos)
    .where(
      and(
        eq(tables.photos.libraryMount, mount),
        isNull(tables.photos.deletedAt),
      ),
    )
    .all() as ScanPhotoRow[]
  const index = buildScanPhotoIndex(mount, photos)

  const node = await applyScanAlbumMeta(
    buildScanAlbumNode(lib, normalized, index),
    index.byId,
  )
  const dirPhotos = [...(index.byDir.get(normalized) ?? [])]
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
      type: p.type,
    }))

  const children: ScanAlbumNode[] = await Promise.all(
    childSegmentsOf(index, normalized)
      .sort((a, b) => a.localeCompare(b))
      .map(async (seg) => {
        const childRel = normalized ? `${normalized}/${seg}` : seg
        const childNode = await applyScanAlbumMeta(
          buildScanAlbumNode(lib, childRel, index),
          index.byId,
        )
        childNode.children = await buildScanAlbumTree(
          lib,
          childRel,
          index,
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
 * 删除其（统一存于内部存储的）缩略图、source='library' 的照片记录，以及扫描库配置行。
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
    // 删除该库的全部缩略图（统一存于内部存储）
    await removeLibraryThumbnails(mount, row.rootPath, '(cleanup)')
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

