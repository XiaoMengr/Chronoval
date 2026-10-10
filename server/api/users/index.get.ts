import { asc } from 'drizzle-orm'

/**
 * 用户列表（仅管理员）：供相簿密码「指定用户免密」标签选择器等场景使用。
 * 只返回最小字段，不暴露密码/2FA 等敏感信息。
 */
export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const rows = useDB()
    .select({
      id: tables.users.id,
      username: tables.users.username,
      email: tables.users.email,
      avatar: tables.users.avatar,
      isAdmin: tables.users.isAdmin,
    })
    .from(tables.users)
    .orderBy(asc(tables.users.id))
    .all()

  return rows
})
