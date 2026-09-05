export default eventHandler(async (event) => {
  const { storageProvider } = useStorageProvider(event)
  const key = getRouterParam(event, 'key')

  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid key' })
  }

  const photo = await storageProvider.get(key)
  if (!photo) {
    throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  }
  // 原图 key 唯一对应一份内容，浏览器可长期缓存
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  logger.chrono.info('Serve image from key', key)
  return photo
})
