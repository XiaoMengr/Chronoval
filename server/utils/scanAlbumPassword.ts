import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * 相簿访问密码的哈希与校验。
 *
 * 新密码用「带盐 SHA-256」存储（形如 `sha256$<盐 hex>$<sha256(盐+密码) hex>`）。
 * 每个密码在设置时生成随机 16 字节盐，相同密码每次生成的存储值也不同，
 * 有效抵抗彩虹表 / 字典攻击。
 *
 * 兼容性：
 * - `sha256$<hash>`           早前未加盐的 sha256（上一版写入）仍可校验
 * - `scrypt$…`                nuxt-auth-utils scrypt 历史密码仍可校验
 * - 重新设置密码后一律写入「带盐 sha256」格式
 */

const SHA_PREFIX = 'sha256$'
const SCRYPT_PREFIX = 'scrypt$'

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input).digest('hex')

const safeEquals = (a: string, b: string): boolean => {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * 生成相簿密码的「带盐 sha256」哈希：
 * 存储形如 `sha256$<盐>$<sha256(盐+密码)>`。
 */
export const hashAlbumPassword = (plain: string): string => {
  const salt = randomBytes(16).toString('hex')
  const digest = sha256Hex(`${salt}${plain}`)
  return `${SHA_PREFIX}${salt}$${digest}`
}

/**
 * 校验相簿密码：
 * - `sha256$<盐>$<hash>`：以存储的盐重算 sha256(盐+明文) 后恒定时间比对
 * - `sha256$<hash>`      兼容上一版「无盐 sha256」
 * - `scrypt$…`           兼容更早期 scrypt 历史密码
 * - 其他格式一律视为无效
 */
export const verifyAlbumPassword = async (
  stored: string,
  plain: string,
): Promise<boolean> => {
  if (stored.startsWith(SHA_PREFIX)) {
    const parts = stored.slice(SHA_PREFIX.length).split('$')
    // 带盐格式：['盐', 'hash']
    if (parts.length === 2 && parts[0] && parts[1]) {
      const expected = sha256Hex(`${parts[0].toLowerCase()}${plain}`)
      return safeEquals(parts[1].toLowerCase(), expected.toLowerCase())
    }
    // 无盐旧格式：单段 64 位 hex
    if (parts.length === 1 && parts[0]) {
      return safeEquals(
        parts[0].toLowerCase(),
        sha256Hex(plain).toLowerCase(),
      )
    }
    return false
  }
  if (stored.startsWith(SCRYPT_PREFIX)) {
    // verifyPassword 来自 nuxt-auth-utils（全局自动导入）
    return await verifyPassword(stored, plain)
  }
  return false
}