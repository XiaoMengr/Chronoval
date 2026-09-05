export default eventHandler(async (_event) => {
  const db = useDB()
  const { listScanAlbumRoots } = await import(
    '~~/server/services/scan-library/manager'
  )

  // 获取所有相册，按创建时间倒序
  const albums = await db.select().from(tables.albums)

  // 为每个相册获取照片 ID 列表（避免循环引用）
  const albumsWithPhotoIds = await Promise.all(
    albums.map(async (album) => {
      const photoIds = await db
        .select({
          photoId: tables.albumPhotos.photoId,
          position: tables.albumPhotos.position,
        })
        .from(tables.albumPhotos)
        .where(eq(tables.albumPhotos.albumId, album.id))
        .orderBy(tables.albumPhotos.position)

      return {
        ...album,
        kind: 'manual',
        // 即使是空相册，也返回空数组而不是 undefined
        photoIds: photoIds.length > 0 ? photoIds.map((p) => p.photoId) : [],
      }
    }),
  )

  // 扫描库转为的相簿以根节点合并进相册列表（kind: 'scan'）
  const scanRoots = await listScanAlbumRoots()
  const combined: unknown[] = [
    ...albumsWithPhotoIds.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    ...scanRoots,
  ]
  return combined
})
