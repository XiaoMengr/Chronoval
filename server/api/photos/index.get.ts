import { and, asc, desc, isNull, notInArray, or } from 'drizzle-orm'
import { getGalleryHiddenScanMountSet } from '~~/server/services/scan-library/manager'

export default eventHandler(async (event) => {
  // 确定性排序：先按拍摄时间倒序，再按 id 升序兜底。
  // 同一拍摄时间出现平手时，数据库返回顺序不保证稳定，会导致
  // 两次拉取/返回画廊时照片顺序抖动。显式按 id 排序后首次进入与返回完全一致。
  // 同时过滤掉已移入回收站（软删除）的照片。
  //
  // 分页支持（limit/offset）：首页画廊在照片达到数万张时改为"首批快速出图 +
  // 客户端后台分片补齐"，避免一次性返回数十 MB 的大 JSON。不传 limit 时保持
  // 全量返回，后台管理等旧调用方完全兼容。
  const q = getQuery(event)
  const galleryOnly = q.gallery === '1'
  const session = await getUserSession(event).catch(() => null)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)

  const limitRaw = parseInt(String(q.limit ?? ''), 10)
  const offsetRaw = parseInt(String(q.offset ?? ''), 10)
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 0
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0

  const where = [isNull(tables.photos.deletedAt)]

  // 首页画廊数据源（?gallery=1）：即使管理员登录，也不返回「已转为相簿」的扫描库照片，
  // 与后台 /dashboard 区分——后台仍需完整数据以便管理，画廊则遵循「相簿只在相册页显示」。
  // 过滤条件必须放进 SQL（而非查完再 filter）：分页时事后过滤会造成某页缺行、
  // 客户端误判"已到末页"。
  if (!(isAdmin && !galleryOnly)) {
    const hiddenScanMounts = getGalleryHiddenScanMountSet()
    if (hiddenScanMounts.size > 0) {
      // library_mount 可能为 NULL（上传照片）：NOT IN 会把 NULL 行排除掉，
      // 所以需要 or(isNull, notInArray) 组合
      where.push(
        or(
          isNull(tables.photos.libraryMount),
          notInArray(
            tables.photos.libraryMount,
            Array.from(hiddenScanMounts),
          ),
        )!,
      )
    }
  }

  let stmt = useDB()
    .select()
    .from(tables.photos)
    .where(and(...where))
    .orderBy(desc(tables.photos.dateTaken), asc(tables.photos.id))
    .$dynamic()
  if (limit > 0) stmt = stmt.limit(limit)
  if (offset > 0) stmt = stmt.offset(offset)

  return stmt.all()
})
