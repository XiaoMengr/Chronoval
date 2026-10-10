import {
  and,
  asc,
  desc,
  eq,
  isNull,
  notInArray,
  or,
  type SQL,
} from 'drizzle-orm'
import { getGalleryHiddenScanMountSet } from '~~/server/services/scan-library/manager'

export default eventHandler(async (event) => {
  const db = useDB()

  // 分页支持（limit/offset）：首页画廊数万张时客户端分片渐进加载；不传则全量返回（兼容）
  const q = getQuery(event)
  const limitRaw = parseInt(String(q.limit ?? ''), 10)
  const offsetRaw = parseInt(String(q.offset ?? ''), 10)
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 0
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0

  const where: SQL[] = []

  // 获取需要从首页照片画廊排除的照片ID：
  // 1) 被标记「相簿隐藏」的相簿照片（整体隐藏，需登录才可见）；
  // 2) 被单独开启「首页画廊隐藏」的相簿照片（仅不入首页照片流）
  const hiddenAlbumPhotos = db
    .select({
      photoId: tables.albumPhotos.photoId,
    })
    .from(tables.albumPhotos)
    .innerJoin(tables.albums, eq(tables.albumPhotos.albumId, tables.albums.id))
    .where(
      or(
        eq(tables.albums.isHidden, true),
        eq(tables.albums.hideFromGallery, true),
      ),
    )
    .all()

  const hiddenPhotoIds = hiddenAlbumPhotos.map((row) => row.photoId)

  // 查询所有照片（排除软删除回收站中的照片），并排除隐藏相册中的照片
  where.push(isNull(tables.photos.deletedAt))
  if (hiddenPhotoIds.length > 0) {
    where.push(notInArray(tables.photos.id, hiddenPhotoIds))
  }

  // 排除已「转为相簿」或被禁用的扫描库照片（只在相册页展示，不再出现在首页全局画廊）。
  // 过滤必须进 SQL：分页时事后 filter 会造成某页缺行，客户端会误判"已到末页"。
  const hiddenScanMounts = getGalleryHiddenScanMountSet()
  if (hiddenScanMounts.size > 0) {
    // library_mount 可能为 NULL（上传照片）：NOT IN 会把 NULL 行排除掉，
    // 所以需要 or(isNull, notInArray) 组合
    where.push(
      or(
        isNull(tables.photos.libraryMount),
        notInArray(tables.photos.libraryMount, Array.from(hiddenScanMounts)),
      )!,
    )
  }

  let stmt = db
    .select()
    .from(tables.photos)
    .where(and(...where))
    .orderBy(desc(tables.photos.dateTaken), asc(tables.photos.id))
    .$dynamic()
  if (limit > 0) stmt = stmt.limit(limit)
  if (offset > 0) stmt = stmt.offset(offset)

  return stmt.all()
})
