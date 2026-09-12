/**
 * 从回收站恢复照片：清除软删除标记，照片重新出现在画廊 / 相册 / 后台。
 * 仅管理员可访问。
 */
export default eventHandler(async (event) => {
  await requireUserSession(event)
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

  useDB()
    .update(tables.photos)
    .set({ deletedAt: null })
    .where(eq(tables.photos.id, photoId))
    .run()

  logger.image.success(`Photo ${photoId} restored from trash`)

  return {
    statusCode: 200,
    statusMessage: 'Photo restored',
  }
})