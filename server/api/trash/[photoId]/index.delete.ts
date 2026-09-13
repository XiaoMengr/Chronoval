import { permanentlyDeletePhoto } from '~~/server/services/trash/cleanup'

/**
 * 从回收站彻底删除照片：移除数据库记录并删除原图 / 缩略图 / 实况视频文件。
 * 这是不可逆操作。仅管理员可访问。
 */
export default eventHandler(async (event) => {
  await requireUserSession(event)
  const { storageProvider } = useStorageProvider(event)
  const photoId = getRouterParam(event, 'photoId')

  if (!photoId) {
    return createError({
      statusCode: 400,
      statusMessage: 'Photo ID is required',
    })
  }

  const photo = await useDB()
    .select()
    .from(tables.photos)
    .where(eq(tables.photos.id, photoId))
    .get()

  if (!photo) {
    return createError({
      statusCode: 404,
      statusMessage: 'Photo not found',
    })
  }

  if (!photo.deletedAt) {
    return createError({
      statusCode: 409,
      statusMessage: 'Photo is not in the trash',
    })
  }

  await permanentlyDeletePhoto(photo, storageProvider)

  return {
    statusCode: 200,
    statusMessage: 'Photo permanently deleted',
  }
})