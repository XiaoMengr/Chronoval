/**
 * 当前账户的登入记录（仅本人），按时间倒序。
 * limit 默认 50，上限 200。供安全设置页「登入记录」展示。
 */
import { desc, eq } from 'drizzle-orm'

const MAX_LOGS = 200

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const db = useDB()

  const query = getQuery(event)
  const rawLimit = Number(query.limit)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, Math.round(rawLimit)), MAX_LOGS)
    : 50

  const logs = db
    .select()
    .from(tables.loginLogs)
    .where(eq(tables.loginLogs.userId, user.id))
    .orderBy(desc(tables.loginLogs.createdAt))
    .limit(limit)
    .all()

  return logs
})