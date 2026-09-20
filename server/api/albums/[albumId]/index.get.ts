import { and, asc, eq, getTableColumns, isNull } from 'drizzle-orm'
import z from 'zod'
import { hasAlbumAccess } from '~~/server/utils/manualAlbumAuth'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import { ensureAlbumUid } from '~~/server/utils/albumUid'
import { getDisabledScanMountSet } from '~~/server/services/scan-library/manager'
import { resolveRandomQuotesPool } from '~~/server/services/settings/quoteLibraries'

export default eventHandler(async (event) => {
  // 支持两种公开访问标识：数字 id（兼容存量链接）与不透明 uid
  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({
      albumId: z.string().min(1),
    }).parse,
  )

  const query = await getValidatedQuery(
    event,
    z.object({
      // 管理端编辑面板专用：管理员传 manage=1 时始终返回完整照片（用于编辑，不对外暴露）
      manage: z.string().optional(),
    }).parse,
  )

  const db = useDB()

  // 纯数字 → 按 id；否则按 uid
  const albumIdNum = /^\d+$/.test(albumId) ? parseInt(albumId, 10) : null
  const album = albumIdNum != null
    ? db
        .select()
        .from(tables.albums)
        .where(eq(tables.albums.id, albumIdNum))
        .get()
    : db
        .select()
        .from(tables.albums)
        .where(eq(tables.albums.uid, albumId))
        .get()

  if (!album) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Album not found',
    })
  }

  // 整套相簿公开逻辑以整数 id 为内部主键，统一定位内部 id
  const albumPk = album.id

  // 检查相册是否隐藏，如果隐藏则需要用户登录才能访问
  if (album.isHidden && !album.passwordHash) {
    const session = await getUserSession(event)
    if (!session.user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Album not found',
      })
    }
  }

  // 密码访问权判定（与扫描相簿一致）：只有显式打开「管理员免密」开关才放行管理员，
  // 否则管理员也必须输入密码；公开访问必须持有解锁 Cookie。
  // 管理端编辑场景（manage=1 + 管理员）例外：管理相簿照片需要返回完整数据。
  const session = await getUserSession(event)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)
  const manageMode = query.manage === '1' && isAdmin
  const adminBypass =
    isAdmin &&
    (await settingsManager.get<boolean>('system', 'scanAlbum.adminBypass', false))
  const authorized = manageMode || hasAlbumAccess(
    event,
    { albumId: albumPk, passwordHash: album.passwordHash },
    Boolean(adminBypass),
  )

  const passwordProtected = Boolean(album.passwordHash)

  // 惰性补全并返回公开 UID
  const uid = await ensureAlbumUid(db, album)

  // 公共字段（不暴露哈希，也不暴露明文）
  const {
    passwordHash: _passwordHash,
    password: _password,
    ...publicAlbum
  } = album
  const baseAlbum = { ...publicAlbum, uid }
  // 明文密码仅在管理端编辑面板（manage=1 + 管理员）回显；公开访问一律不返回
  const safeAlbum = manageMode
    ? { ...baseAlbum, password: album.password ?? undefined }
    : baseAlbum

  // 「随机照片轮经典语录」最终生效语录池：标签优先（内置古诗/现代库），否则自定义，两者皆无则空（旋转时不显示）
  const randomQuotesPool = await resolveRandomQuotesPool(
    (album as any).randomQuotesTag,
    (album as any).randomQuotes,
  )

  // 未解锁的受保护相簿：仅返回标题/介绍/封面等元数据用于加锁界面，不返回照片
  if (passwordProtected && !authorized) {
    return {
      ...safeAlbum,
      randomQuotesPool,
      passwordProtected: true,
      authorized: false,
      photos: [],
    }
  }

  // 获取相册中的照片（排除已移入回收站的软删除照片）
  const photos = await db
    // all fields from tables.photos
    .select({
      ...getTableColumns(tables.photos),
    })
    .from(tables.photos)
    .innerJoin(
      tables.albumPhotos,
      eq(tables.photos.id, tables.albumPhotos.photoId),
    )
    .where(
      and(
        eq(tables.albumPhotos.albumId, albumPk),
        isNull(tables.photos.deletedAt),
      ),
    )
    .orderBy(asc(tables.albumPhotos.position))
    .all()

  // 公开/编辑之外的普通访问：剔除「已禁用扫描库」的照片。
  // 禁用库的图片路由（/library/<mount>/...）已不再提供，留在相册里会导致点击后加载失败；
  // 管理员编辑模式（manage=1）需保留完整照片以便管理（与后台 /dashboard 一致）。
  if (!manageMode) {
    const disabledScanMounts = getDisabledScanMountSet()
    if (disabledScanMounts.size > 0) {
      const filtered = photos.filter(
        (p) => !p.libraryMount || !disabledScanMounts.has(p.libraryMount),
      )
      // 复用兜底去重前的数组引用；下方 uniquePhotos 基于该数组去重
      photos.length = 0
      photos.push(...filtered)
    }
  }

  // 验证相册数据完整性
  if (!photos || !Array.isArray(photos)) {
    // 空相册也是合法的，只需要返回空数组
    return {
      ...safeAlbum,
      randomQuotesPool,
      passwordProtected,
      authorized,
      photos: [],
    }
  }

  // 兜底去重：防御历史脏数据导致的重复行（正常由唯一索引保证唯一）
  const seen = new Set<string>()
  const uniquePhotos = photos.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  return {
    ...safeAlbum,
    randomQuotesPool,
    passwordProtected,
    authorized,
    photos: uniquePhotos,
  }
})