import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * 普通相簿（albums 表）的访问密码鉴权。
 *
 * 密码存于 albums.password_hash（单向哈希，由后台相簿编辑面板维护）。
 * 解锁令牌按相簿 id 签发，不同相簿互不干扰；密码变更后旧令牌自动失效。
 * - 管理员是否放行见各接口（默认与扫描相簿一致：仅当系统开关开启时才免密）。
 * - 无密码时视为开放相簿（直接放行）。
 */

const DEFAULT_SECRET = 'chronoval-album-unlock'

const cookieName = (albumId: number): string => `album_${albumId}`

const getSecret = (): string =>
  process.env.ALBUM_UNLOCK_SECRET || DEFAULT_SECRET

/** 生成与当前密码哈希绑定的解锁令牌 */
export const albumToken = (
  albumId: number,
  passwordHash: string | null,
): string => {
  return createHmac('sha256', getSecret())
    .update(`album:${albumId}:${passwordHash || ''}`)
    .digest('base64url')
}

const safeEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * 是否已获得相簿访问权限。
 * @param allowAdmin 是否放行管理员（由系统开关决定）
 * @param passwordHash 该相簿生效的密码哈希；null 表示未设置密码（开放）
 */
export const hasAlbumAccess = (
  event: any,
  opts: { albumId: number; passwordHash: string | null },
  allowAdmin: boolean,
): boolean => {
  if (allowAdmin) return true
  // 未设置密码 → 开放，直接放行
  if (!opts.passwordHash) return true

  const scope = cookieName(opts.albumId)
  const stored = getCookie(event, scope)
  if (!stored) return false
  const idx = stored.indexOf(':')
  if (idx === -1) return false
  const id = Number(stored.slice(0, idx))
  const token = stored.slice(idx + 1)
  const expected = albumToken(opts.albumId, opts.passwordHash)
  return id === opts.albumId && safeEqual(token, expected)
}

/** 签发解锁 Cookie（密码校验通过后调用） */
export const authorizeAlbum = (
  event: any,
  opts: { albumId: number; passwordHash: string | null },
): void => {
  const scope = cookieName(opts.albumId)
  setCookie(event, scope, `${opts.albumId}:${albumToken(opts.albumId, opts.passwordHash)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // 与登录 cookie 保持一致
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 天
  })
}

/** 清除解锁 Cookie */
export const revokeAlbum = (event: any, albumId: number): void => {
  deleteCookie(event, cookieName(albumId), { path: '/' })
}