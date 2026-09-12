import {
  and,
  asc,
  desc,
  isNull,
  notInArray,
} from 'drizzle-orm'
import { getAlbumScanMountSet } from '~~/server/services/scan-library/manager'

export default eventHandler(async (_event) => {
  const db = useDB()

  // 获取所有隐藏相册中的照片ID
  const hiddenAlbumPhotos = db
    .select({
      photoId: tables.albumPhotos.photoId,
    })
    .from(tables.albumPhotos)
    .innerJoin(tables.albums, eq(tables.albumPhotos.albumId, tables.albums.id))
    .where(eq(tables.albums.isHidden, true))
    .all()

  const hiddenPhotoIds = hiddenAlbumPhotos.map((row) => row.photoId)

  let rows: Array<typeof tables.photos.$inferSelect>
  // 查询所有照片（排除软删除回收站中的照片），并排除隐藏相册中的照片
  if (hiddenPhotoIds.length > 0) {
    rows = db
      .select()
      .from(tables.photos)
      .where(
        and(
          isNull(tables.photos.deletedAt),
          notInArray(tables.photos.id, hiddenPhotoIds),
        ),
      )
      .orderBy(desc(tables.photos.dateTaken), asc(tables.photos.id))
      .all()
  } else {
    rows = db
      .select()
      .from(tables.photos)
      .where(isNull(tables.photos.deletedAt))
      .orderBy(desc(tables.photos.dateTaken), asc(tables.photos.id))
      .all()
  }

  // 排除已「转为相簿」的扫描库照片（这类照片只在相册页展示，不再出现在首页全局画廊）
  const albumMounts = getAlbumScanMountSet()
  if (albumMounts.size === 0) return rows
  return rows.filter(
    (p) => !p.libraryMount || !albumMounts.has(p.libraryMount),
  )
})