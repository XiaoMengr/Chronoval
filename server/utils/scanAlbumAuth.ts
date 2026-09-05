import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * 扫描相簿（扫描库转相簿）的访问密码鉴权。
 *
 * 思路：签发一个与当前 passwordHash 绑定的 HMAC 令牌，写入 HttpOnly Cookie。
 * - 密码正确 → 签发令牌，嵌套子相簿共用同一库 id，天然继承解锁状态，无需重复输入。
 * - 密码变更 → 旧令牌失效，需重新输入。
 * - 管理员始终放行（绕过密码）。
 */

const DEFAULT_SECRET = 'chronoval-scan-album-unlock'

const cookieName = (libId: number) => `scan_album_${libId}`

const getSecret = (): string =>
  process.env.SCAN_ALBUM_UNLOCK_SECRET || DEFAULT_SECRET

/** 生成与当前密码哈希绑定的解锁令牌 */
export const scanAlbumToken = (
  libId: number,
  passwordHash: string | null,
): string => {
  return createHmac('sha256', getSecret())
    .update(`${libId}:${passwordHash || ''}`)
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
 * @param isAdmin 是否为管理员（管理员直接放行）
 */
export const hasScanAlbumAccess = (
  event: any,
  lib: { id: number; passwordHash: string | null },
  isAdmin: boolean,
): boolean => {
  if (isAdmin) return true
  if (!lib.passwordHash) return false
  const stored = getCookie(event, cookieName(lib.id))
  if (!stored) return false
  const idx = stored.indexOf(':')
  if (idx === -1) return false
  const id = Number(stored.slice(0, idx))
  const token = stored.slice(idx + 1)
  const expected = scanAlbumToken(lib.id, lib.passwordHash)
  return id === lib.id && safeEqual(token, expected)
}

/** 签发解锁 Cookie（密码校验通过后调用） */
export const authorizeScanAlbum = (
  event: any,
  lib: { id: number; passwordHash: string | null },
): void => {
  setCookie(
    event,
    cookieName(lib.id),
    `${lib.id}:${scanAlbumToken(lib.id, lib.passwordHash)}`,
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // 与登录 cookie 保持一致
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 天
    },
  )
}

/** 清除解锁 Cookie */
export const revokeScanAlbum = (event: any, libId: number): void => {
  deleteCookie(event, cookieName(libId), { path: '/' })
}