import { and, eq } from 'drizzle-orm'
import { useDB, tables } from '../../utils/db'
import type { ScanAlbumNode } from './manager'

export type ScanAlbumMetaRow = typeof tables.scanAlbumMeta.$inferSelect

/** 「随机一张照片」动画模式：default=直接打开；wheel=3D轮盘动画；compat=轻量兼容动画 */
export type RandomAnimationMode = 'default' | 'wheel' | 'compat'

export interface ScanAlbumMetaInput {
  mount: string
  relPath: string
  title?: string | null
  description?: string | null
  coverPhotoId?: string | null
  isHidden?: boolean | null
  /** 相簿访问密码哈希；null=清除密码，undefined=保持不变 */
  passwordHash?: string | null
  /** 相簿访问密码明文（仅管理端回显）；null=清除，undefined=保持不变 */
  password?: string | null
  slug?: string | null
  /** 相簿自身公开 URL 标识（随机）；null=清除改用默认，undefined=保持不变 */
  urlKey?: string | null
  /** 照片展示布局；undefined=保持不变 */
  layout?: 'waterfall' | 'grid' | 'immersive' | 'timeline'
  /** 「随机一张照片」是否使用 3D 轮盘动画；undefined=保持不变（已废弃，改由 randomAnimation 接管） */
  randomWheelAnimation?: boolean
  /** 「随机一张照片」动画模式；undefined=保持不变 */
  randomAnimation?: RandomAnimationMode
}

const cleanRelPath = (p: string): string =>
  p
    .split('/')
    .map((s) => decodeURIComponent(s))
    .filter((s) => s && s !== '.' && s !== '..')
    .join('/')

/** 按 挂载名+相对路径 读取一条扫描相簿元数据 */
export const getScanAlbumMeta = async (
  mount: string,
  relPath: string,
): Promise<ScanAlbumMetaRow | null> => {
  const row = await useDB()
    .select()
    .from(tables.scanAlbumMeta)
    .where(
      and(
        eq(tables.scanAlbumMeta.mount, mount),
        eq(tables.scanAlbumMeta.relPath, cleanRelPath(relPath)),
      ),
    )
    .get()
  return row ?? null
}

/**
 * 新增或更新一条扫描相簿元数据。
 * 传入 null 的字段表示“使用默认值”，调用方需注意只传确实要覆盖的字段。
 */
export const upsertScanAlbumMeta = async (
  input: ScanAlbumMetaInput,
): Promise<ScanAlbumMetaRow> => {
  const db = useDB()
  const relPath = cleanRelPath(input.relPath)

  const existing = await db
    .select()
    .from(tables.scanAlbumMeta)
    .where(
      and(
        eq(tables.scanAlbumMeta.mount, input.mount),
        eq(tables.scanAlbumMeta.relPath, relPath),
      ),
    )
    .get()

  if (existing) {
    const updateData: Partial<ScanAlbumMetaRow> = { updatedAt: new Date() }
    if (input.title !== undefined) updateData.title = input.title || null
    if (input.description !== undefined)
      updateData.description = input.description || null
    if (input.coverPhotoId !== undefined)
      updateData.coverPhotoId = input.coverPhotoId || null
    if (input.isHidden !== undefined) updateData.isHidden = Boolean(input.isHidden)
    if (input.passwordHash !== undefined)
      updateData.passwordHash = input.passwordHash || null
    if (input.password !== undefined)
      updateData.password = input.password || null
    if (input.slug !== undefined) updateData.slug = input.slug || null
    if (input.urlKey !== undefined)
      updateData.urlKey = (input.urlKey && input.urlKey.trim()) || null
    if (input.layout !== undefined) updateData.layout = input.layout
    if (input.randomWheelAnimation !== undefined)
      updateData.randomWheelAnimation = Boolean(input.randomWheelAnimation)
    if (input.randomAnimation !== undefined)
      updateData.randomAnimation = input.randomAnimation

    await db
      .update(tables.scanAlbumMeta)
      .set(updateData)
      .where(eq(tables.scanAlbumMeta.id, existing.id))
      .run()

    return db
      .select()
      .from(tables.scanAlbumMeta)
      .where(eq(tables.scanAlbumMeta.id, existing.id))
      .get() as ScanAlbumMetaRow
  }

  return db
    .insert(tables.scanAlbumMeta)
    .values({
      mount: input.mount,
      relPath,
      title: input.title || null,
      description: input.description || null,
      coverPhotoId: input.coverPhotoId || null,
      isHidden: input.isHidden ? true : false,
      passwordHash: input.passwordHash ?? null,
      password: input.password ?? null,
      slug: input.slug || null,
      urlKey: (input.urlKey && input.urlKey.trim()) || null,
      layout: input.layout ?? 'waterfall',
      randomWheelAnimation: input.randomWheelAnimation ? true : false,
      randomAnimation: input.randomAnimation ?? 'default',
    })
    .returning()
    .get()
}

/** 删除一条扫描相簿元数据（还原为默认推导值） */
export const clearScanAlbumMeta = async (
  mount: string,
  relPath: string,
): Promise<boolean> => {
  const res = await useDB()
    .delete(tables.scanAlbumMeta)
    .where(
      and(
        eq(tables.scanAlbumMeta.mount, mount),
        eq(tables.scanAlbumMeta.relPath, cleanRelPath(relPath)),
      ),
    )
    .run()
  return res.changes > 0
}

/** 按自定义URL别名读取相簿元数据（用于 /albums/s/{slug} 解析） */
export const getScanAlbumMetaBySlug = async (
  slug: string,
): Promise<ScanAlbumMetaRow | null> => {
  if (!slug) return null
  const row = await useDB()
    .select()
    .from(tables.scanAlbumMeta)
    .where(eq(tables.scanAlbumMeta.slug, slug))
    .get()
  return row ?? null
}

/** 按相簿自身的公开 URL 标识读取元数据（用于 /albums/scan/{urlKey} 反查） */
export const getScanAlbumMetaByUrlKey = async (
  urlKey: string,
): Promise<ScanAlbumMetaRow | null> => {
  if (!urlKey) return null
  const row = await useDB()
    .select()
    .from(tables.scanAlbumMeta)
    .where(eq(tables.scanAlbumMeta.urlKey, urlKey))
    .get()
  return row ?? null
}

/**
 * 把元数据覆盖应用到扫描相簿节点上：
 * - 标题 / 介绍 / 隐藏 / 自定义封面
 * - 自定义URL别名（有 slug 时公开链接改为 /albums/s/{slug}）
 * @param node 已构建的默认节点
 * @param photos 该挂载下的全部照片（用于解析自定义封面的缩略图）
 */
export const applyScanAlbumMeta = async (
  node: ScanAlbumNode,
  photos: Array<{ id: string; thumbnailUrl: string | null; thumbnailHash: string | null; aspectRatio: number | null }>,
): Promise<ScanAlbumNode> => {
  const meta = await getScanAlbumMeta(node.mount, node.relPath)
  if (!meta) {
    return { ...node, external: true }
  }

  const covers = [...node.covers]
  let coverPhotoId = node.coverPhotoId

  if (meta.coverPhotoId) {
    const photo = photos.find((p) => p.id === meta.coverPhotoId)
    if (photo) {
      // 自定义封面通常来自本相簿的默认封面（node.covers），
      // unshift 前先去重，避免同一张封面在 covers 中出现两次。
      const already = covers.some((c) => c.id === photo.id)
      if (!already) {
        covers.unshift({
          id: photo.id,
          thumbnailUrl: photo.thumbnailUrl,
          thumbnailHash: photo.thumbnailHash,
          aspectRatio: photo.aspectRatio,
        })
      }
      coverPhotoId = photo.id
    } else {
      coverPhotoId = meta.coverPhotoId
    }
  }

  return {
    ...node,
    external: true,
    title: meta.title || node.title,
    description: meta.description || null,
    isHidden: meta.isHidden,
    passwordProtected: meta.passwordHash ? true : node.passwordProtected,
    password: meta.password || undefined,
    coverPhotoId,
    covers,
    urlKey: meta.urlKey || node.urlKey,
    // 布局：自定义元数据优先，否则使用节点默认
    layout: meta.layout ?? node.layout,
    // 「随机一张照片」是否使用轮盘动画（默认关闭=直接打开）
    randomWheelAnimation: meta.randomWheelAnimation ?? false,
    // 「随机一张照片」动画模式（default=直接打开 / wheel=轮盘 / compat=兼容动画）
    randomAnimation: meta.randomAnimation ?? 'default',
    // 公开链接优先级：自定义 slug > 相簿自身 urlKey > 库级默认
    link: meta.slug
      ? `/albums/s/${encodeURIComponent(meta.slug)}`
      : meta.urlKey
        ? `/albums/scan/${encodeURIComponent(meta.urlKey)}`
        : node.link,
    slug: meta.slug || null,
    hasCustom: true,
  }
}