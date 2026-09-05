import { desc } from 'drizzle-orm'
import { getAlbumScanMountSet } from '~~/server/services/scan-library/manager'

export default eventHandler(async (event) => {
  const rows = useDB()
    .select()
    .from(tables.photos)
    .orderBy(desc(tables.photos.dateTaken))
    .all()

  // 首页画廊数据源（?gallery=1）：即使管理员登录，也不返回「已转为相簿」的扫描库照片，
  // 与后台 /dashboard 区分——后台仍需完整数据以便管理，画廊则遵循「相簿只在相册页显示」。
  const galleryOnly = getQuery(event).gallery === '1'

  const session = await getUserSession(event).catch(() => null)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)
  if (isAdmin && !galleryOnly) return rows

  const albumMounts = getAlbumScanMountSet()
  if (albumMounts.size === 0) return rows
  return rows.filter(
    (p) => !p.libraryMount || !albumMounts.has(p.libraryMount),
  )
})