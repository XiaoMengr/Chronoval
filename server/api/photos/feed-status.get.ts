import { eq, isNull } from 'drizzle-orm'
import { getGalleryHiddenScanMountSet } from '~~/server/services/scan-library/manager'

/**
 * 画廊"指纹"接口（轻量）：只返回当前画廊可见照片的 数量 + 最新拍摄时间，
 * 不含 EXIF/完整 JSON，用于前端只有在集合发生变化时才触发一次完整 refresh。
 *
 * 可见性规则与画廊各数据源保持一致：
 * - 管理员（相册页/后台画廊 ?gallery=1）：全部照片，排除「已转为相簿」的扫描库；
 * - 公开画廊（/api/photos/visible）：额外排除隐藏相簿内的照片。
 */
export default eventHandler(async (event) => {
  const db = useDB()
  const session = await getUserSession(event).catch(() => null)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)

  const hiddenScanMounts = getGalleryHiddenScanMountSet()

  // 公开画廊才需要排除隐藏相簿里的照片
  let hiddenPhotoIds = new Set<string>()
  if (!isAdmin) {
    const hidden = db
      .select({ photoId: tables.albumPhotos.photoId })
      .from(tables.albumPhotos)
      .innerJoin(tables.albums, eq(tables.albumPhotos.albumId, tables.albums.id))
      .where(eq(tables.albums.isHidden, true))
      .all()
    hiddenPhotoIds = new Set(hidden.map((r) => r.photoId))
  }

  // 只取 id / 挂载 / 拍摄时间，不加载大字段；排除已移入回收站的软删除照片
  const rows = db
    .select({
      id: tables.photos.id,
      libraryMount: tables.photos.libraryMount,
      dateTaken: tables.photos.dateTaken,
    })
    .from(tables.photos)
    .where(isNull(tables.photos.deletedAt))
    .all()

  let count = 0
  let maxDateTaken: string | null = null
  for (const r of rows) {
    if (!isAdmin && hiddenPhotoIds.has(r.id)) continue
    if (r.libraryMount && hiddenScanMounts.has(r.libraryMount)) continue
    count++
    if (r.dateTaken && (!maxDateTaken || r.dateTaken > maxDateTaken)) {
      maxDateTaken = r.dateTaken
    }
  }

  return { count, maxDateTaken, t: Date.now() }
})