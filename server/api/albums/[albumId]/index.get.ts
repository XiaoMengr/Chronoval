import { and, asc, getTableColumns, isNull } from 'drizzle-orm'
import z from 'zod'

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
  if (album.isHidden) {
    const session = await getUserSession(event)
    if (!session.user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Album not found',
      })
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
      ...album,
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
    ...album,
    photos: uniquePhotos,
  }
})
