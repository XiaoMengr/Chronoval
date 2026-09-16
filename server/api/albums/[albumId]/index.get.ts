import { and, asc, getTableColumns, isNull } from 'drizzle-orm'
import z from 'zod'
import { hasAlbumAccess } from '~~/server/utils/manualAlbumAuth'
import { settingsManager } from '~~/server/services/settings/settingsManager'

export default eventHandler(async (event) => {
  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({
      albumId: z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10)),
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

  const album = db
    .select()
    .from(tables.albums)
    .where(eq(tables.albums.id, albumId))
    .get()

  if (!album) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Album not found',
    })
  }

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
    { albumId, passwordHash: album.passwordHash },
    Boolean(adminBypass),
  )

  const passwordProtected = Boolean(album.passwordHash)

  // 公共字段（不暴露哈希）
  const {
    passwordHash: _passwordHash,
    ...publicAlbum
  } = album

  // 未解锁的受保护相簿：仅返回标题/介绍/封面等元数据用于加锁界面，不返回照片
  if (passwordProtected && !authorized) {
    return {
      ...publicAlbum,
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
        eq(tables.albumPhotos.albumId, albumId),
        isNull(tables.photos.deletedAt),
      ),
    )
    .orderBy(asc(tables.albumPhotos.position))
    .all()

  // 验证相册数据完整性
  if (!photos || !Array.isArray(photos)) {
    // 空相册也是合法的，只需要返回空数组
    return {
      ...publicAlbum,
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
    ...publicAlbum,
    passwordProtected,
    authorized,
    photos: uniquePhotos,
  }
})