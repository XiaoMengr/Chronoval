import type { users as usersTable } from '../database/schema'

type UserRow = typeof usersTable.$inferSelect

/**
 * 从数据库用户行中取出可安全放进会话/回传给客户端的字段。
 * 一律剔除 password、totpSecret 等敏感项，避免通过会话或 /api/profile 泄露。
 */
export function toSessionUser(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    createdAt: user.createdAt,
    isAdmin: user.isAdmin,
  }
}

export type SessionUser = ReturnType<typeof toSessionUser>