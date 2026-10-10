/**
 * 相簿密码「免密范围」判定。
 *
 * 相簿设置了访问密码后，可配置免密范围：
 * - 'logged_in'  任意已登录用户免密
 * - 'selected'   仅 password_exempt_users（邮箱 JSON 数组）内的用户免密
 * - null/未设置  所有访问者都需输入密码
 *
 * 免密用户邮箱列表仅限管理端读写；公开接口一律不得返回该字段。
 */

export type PasswordExemptMode = 'logged_in' | 'selected' | null

/** 解析免密用户邮箱列表（容错：非法 JSON/类型一律视为空列表） */
export const parseExemptUsers = (
  raw?: string | string[] | null,
): string[] => {
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : (() => {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  })()
  return arr.filter((x): x is string => typeof x === 'string' && !!x.trim())
}

/** 判定某用户是否在该相簿的免密范围内（仅对已设密码的相簿有意义） */
export const isPasswordExemptForUser = (
  album: {
    passwordHash?: string | null
    passwordExemptMode?: string | null
    passwordExemptUsers?: string | string[] | null
  },
  user?: { email?: string | null } | null,
): boolean => {
  if (!album?.passwordHash || !user?.email) return false
  if (album.passwordExemptMode === 'logged_in') return true
  if (album.passwordExemptMode === 'selected') {
    return parseExemptUsers(album.passwordExemptUsers).includes(user.email)
  }
  return false
}
