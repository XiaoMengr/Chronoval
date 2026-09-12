import { desc, isNotNull } from 'drizzle-orm'

/**
 * 回收站照片列表：返回所有已软删除（移入回收站）的照片，按删除时间倒序。
 * 仅管理员可访问。
 */
export default eventHandler(async (event) => {
  await requireUserSession(event)

  const rows = useDB()
    .select()
    .from(tables.photos)
    .where(isNotNull(tables.photos.deletedAt))
    .orderBy(desc(tables.photos.deletedAt))
    .all()

  return rows
})