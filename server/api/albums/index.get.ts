export default eventHandler(async (event) => {
  const db = useDB()
  const { listScanAlbumRoots } = await import(
    '~~/server/services/scan-library/manager'
  )
  const { ensureAlbumUid } = await import('~~/server/utils/albumUid')

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

      const {
        passwordHash: _passwordHash,
        ...restAlbum
      } = album

      // 惰性补全公开 UID（存量相簿首次返回时自动落库）。
      // 同时保证公开链接使用不透明 uid，而非暴露自增 id。
      const uid = await ensureAlbumUid(db, album)

      return {
        ...restAlbum,
        uid,
        kind: 'manual',
        // 密码类型：是否有访问密码（不暴露真实哈希）
        passwordProtected: Boolean(album.passwordHash),
        // 即使是空相册，也返回空数组而不是 undefined
        photoIds: photoIds.length > 0 ? photoIds.map((p) => p.photoId) : [],
        photoCount: photoIds.length,
      }
    }),
  )

  // 扫描库转为的相簿以根节点合并进相册列表（kind: 'scan'）。
  // 管理端需要树状二级相簿，故 includeChildren=isAdmin。
  // 扫描库是可选的「增强」特性：即便该模块初始化异常（如 migrate 未建表），
  // 也不应拖垮整个相簿列表接口导致「加载相簿失败」——此处隔离兜底。
  let visibleScanRoots: Awaited<ReturnType<typeof listScanAlbumRoots>> = []
  try {
    const scanRoots = await listScanAlbumRoots(isAdmin)
    visibleScanRoots = isAdmin
      ? scanRoots
      : scanRoots.filter((node) => !node.isHidden)
  } catch (error) {
    console.error('[albums] 扫描库相簿加载失败，已忽略：', error)
  }

  const combined: unknown[] = [
    ...albumsWithPhotoIds.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    ...visibleScanRoots,
  ]
  return combined
})