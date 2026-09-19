import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * 扫描相簿（外部库转相簿）的访问密码鉴权。
 *
 * 密码从「扫描库」下沉到「相簿」级别（存于 scan_album_meta.password_hash，
 * 由后台相册的相簿编辑面板维护）。解锁令牌按 相簿 id + 相对路径 签发，
 * 因此不同子相簿可以各自带密码，互不干扰；密码变更后旧令牌自动失效。
 * - 管理员始终放行（绕过密码）。
 * - 无密码时视为开放相簿（直接放行）。
 */

const DEFAULT_SECRET = 'chronoval-scan-album-unlock'

/** 解锁 Cookie 名：同一相簿可按不同相对路径分别解锁 */
const cookieName = (libId: number, relPath: string): string => {
  const slug =
    (relPath || '')
      .split('/')
      .map((s) => s.replace(/[^a-zA-Z0-9-_]/g, '_'))
      .filter(Boolean)
      .join('_') || ''
  return slug ? `scan_album_${libId}_${slug}` : `scan_album_${libId}`
}

const getSecret = (): string =>
  process.env.SCAN_ALBUM_UNLOCK_SECRET || DEFAULT_SECRET

/** 生成与当前密码哈希绑定的解锁令牌 */
export const scanAlbumToken = (
  scopeKey: string,
  passwordHash: string | null,
): string => {
  return createHmac('sha256', getSecret())
    .update(`${scopeKey}:${passwordHash || ''}`)
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
 * @param passwordHash 该相簿生效的密码哈希；null 表示未设置密码（开放）
 */
export const hasScanAlbumAccess = (
  event: any,
  opts: { libId: number; relPath: string; passwordHash: string | null },
  isAdmin: boolean,
): boolean => {
  if (isAdmin) return true
  // 未设置密码 → 开放，直接放行
  if (!opts.passwordHash) return true

  const scope = cookieName(opts.libId, opts.relPath)
  const stored = getCookie(event, scope)
  if (!stored) return false
  const idx = stored.indexOf(':')
  if (idx === -1) return false
  const id = Number(stored.slice(0, idx))
  const token = stored.slice(idx + 1)
  const expected = scanAlbumToken(scope, opts.passwordHash)
  return id === opts.libId && safeEqual(token, expected)
}

/** 签发解锁 Cookie（密码校验通过后调用） */
export const authorizeScanAlbum = (
  event: any,
  opts: { libId: number; relPath: string; passwordHash: string | null },
): void => {
  const scope = cookieName(opts.libId, opts.relPath)
  setCookie(
    event,
    scope,
    `${opts.libId}:${scanAlbumToken(scope, opts.passwordHash)}`,
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // 与登录 cookie 保持一致
      path: '/',
      // 不设 maxAge → 会话 Cookie：浏览器/会话关闭后即失效，下次访问需重新输入密码
    },
  )
}

/** 清除解锁 Cookie */
export const revokeScanAlbum = (
  event: any,
  libId: number,
  relPath?: string,
): void => {
  deleteCookie(event, cookieName(libId, relPath || ''), { path: '/' })
}