import { eq, tables, useDB } from '~~/server/utils/db'
import { leftJoin } from 'drizzle-orm'

export default eventHandler(async (event) => {
  const db = useDB()
  const { listScanAlbumRoots, getDisabledScanMountSet } = await import(
    '~~/server/services/scan-library/manager'
  )
  const { ensureAlbumUid } = await import('~~/server/utils/albumUid')

  // 管理端（登录管理员）返回完整树状二级相簿并包含隐藏的外部库相簿；
  // 公开访问时过滤掉设置为“隐藏”的外部库相簿。
  const session = await getUserSession(event).catch(() => null)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)

  // 非管理员：剔除「已禁用扫描库」的照片，避免相册封面/列表出现加载失败的坏图
  const disabledScanMounts = getDisabledScanMountSet()

  // 获取所有相册，按创建时间倒序
  const albums = await db.select().from(tables.albums)

  // 为每个相册获取照片 ID 列表与封面堆叠数据。
  // 注意：better-sqlite3 为同步驱动，必须串行（不能 Promise.all 并发）执行，
  // 否则同一连接上的 prepared 语句参数状态会互相错乱。
  const albumsWithPhotoIds: any[] = []
  for (const album of albums) {
    // 一次查询取回相簿照片及对应缩略图封面信息（按相簿内位置排序）。
    // 关键：不能对每个封面照片单独发查询，better-sqlite3 的 prepared 语句
    // 在多次复用时会参数错乱；合并成单条查询可绕开该问题。
    const photoRows = db
      .select({
        photoId: tables.albumPhotos.photoId,
        position: tables.albumPhotos.position,
        thumbnailUrl: tables.photos.thumbnailUrl,
        thumbnailHash: tables.photos.thumbnailHash,
        aspectRatio: tables.photos.aspectRatio,
        libraryMount: tables.photos.libraryMount,
      })
      .from(tables.albumPhotos)
      .leftJoin(tables.photos, eq(tables.albumPhotos.photoId, tables.photos.id))
      .where(eq(tables.albumPhotos.albumId, album.id))
      .orderBy(tables.albumPhotos.position)
      .all()
    // 非管理员：剔除已禁用扫描库的照片，封面与 photoIds 均不再引用
    const rows =
      !isAdmin && disabledScanMounts.size > 0
        ? photoRows.filter(
            (r) => !r.libraryMount || !disabledScanMounts.has(r.libraryMount),
          )
        : photoRows
    const photoIds = rows.map((r) => r.photoId)

    const { passwordHash: _passwordHash, password: _password, ...restAlbum } =
      album

    // 惰性补全公开 UID（存量相簿首次返回时自动落库）。
    // 同时保证公开链接使用不透明 uid，而非暴露自增 id。
    const uid = await ensureAlbumUid(db, album)

    // 构造相簿封面堆叠数据（与外部库相簿 covers 一致），
    // 让普通相簿也能在相簿首页展示「多张照片堆叠」效果。
    // 封面照片置顶，其余按相簿内顺序补充，最多 3 张。
    const covers: {
      id: string
      thumbnailUrl: string | null
      thumbnailHash: string | null
      aspectRatio: number | null
    }[] = []
    if (rows.length) {
      const ordered: string[] = []
      if (album.coverPhotoId) ordered.push(album.coverPhotoId)
      for (const pid of photoIds) {
        if (!ordered.includes(pid)) ordered.push(pid)
      }
      const rowById = new Map(rows.map((r) => [r.photoId, r]))
      for (const pid of ordered.slice(0, 3)) {
        const row = rowById.get(pid)
        if (row) {
          covers.push({
            id: row.photoId,
            thumbnailUrl: row.thumbnailUrl,
            thumbnailHash: row.thumbnailHash,
            aspectRatio: row.aspectRatio,
          })
        }
      }
    }

    albumsWithPhotoIds.push({
      ...restAlbum,
      uid,
      kind: 'manual',
      covers,
      // 密码类型：是否有访问密码（不暴露真实哈希）
      passwordProtected: Boolean(album.passwordHash),
      // 明文密码仅对管理员回显；公开访问一律不返回
      password: isAdmin ? album.password ?? undefined : undefined,
      // 即使是空相册，也返回空数组而不是 undefined
      photoIds: photoIds.length > 0 ? photoIds.map((p) => p.photoId) : [],
      photoCount: photoIds.length,
    })
  }

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

  // 公开访问时彻底剥离扫描相簿节点上的明文密码（含二级子相簿）
  if (!isAdmin) {
    const strip = (node: any): any => {
      const { password: _pw, children, ...rest } = node
      return children?.length
        ? { ...rest, children: children.map(strip) }
        : rest
    }
    visibleScanRoots = visibleScanRoots.map(strip)
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