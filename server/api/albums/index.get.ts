export default eventHandler(async (event) => {
  const db = useDB()
  const { listScanAlbumRoots } = await import(
    '~~/server/services/scan-library/manager'
  )

  // 管理端（登录管理员）返回完整树状二级相簿并包含隐藏的外部库相簿；
  // 公开访问时过滤掉设置为“隐藏”的外部库相簿。
  const session = await getUserSession(event).catch(() => null)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)

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

  // 扫描库转为的相簿以根节点合并进相册列表（kind: 'scan'）。
  // 管理端需要树状二级相簿，故 includeChildren=isAdmin。
  const scanRoots = await listScanAlbumRoots(isAdmin)
  const visibleScanRoots = isAdmin
    ? scanRoots
    : scanRoots.filter((node) => !node.isHidden)

  const combined: unknown[] = [
    ...albumsWithPhotoIds.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    ...visibleScanRoots,
  ]
  return combined
})