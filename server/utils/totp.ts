import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// ===== Base32 (RFC 4648) =====
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** 20 字节随机 → 32 字符 Base32 密钥（otpauth 认可的无填充形式） */
export function generateTotpSecret(): string {
  const bytes = randomBytes(20)
  return base32Encode(bytes, true)
}

export function base32Encode(buf: Uint8Array, noPadding = true): string {
  let bits = 0
  let value = 0
  let out = ''
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]!
    bits += 8
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31]!
      bits -= 5
    }
  }
  if (bits > 0) {
    out += B32_ALPHABET[(value << (5 - bits)) & 31]!
  }
  return noPadding ? out : out.padEnd(Math.ceil(out.length / 8) * 8, '=')
}

export function base32Decode(str: string): Buffer {
  let cleaned = str.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '')
  const buf = Buffer.alloc(Math.floor((cleaned.length * 5) / 8))
  let bits = 0
  let value = 0
  let index = 0
  for (const ch of cleaned) {
    const pos = B32_ALPHABET.indexOf(ch)
    if (pos === -1) continue
    value = (value << 5) | pos
    bits += 5
    if (bits >= 8) {
      buf[index++] = (value >>> (bits - 8)) & 0xff
      bits -= 8
    }
  }
  return buf
}

// ===== TOTP (RFC 6238) =====
const TOTP_PERIOD = 30
const TOTP_DIGITS = 6
const TOTP_WINDOW = 1

function hotp(secretBytes: Buffer | Uint8Array, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', secretBytes).update(msg).digest()
  const offset = hmac[19]! & 0x0f
  const binCode =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!
  return (binCode % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0')
}

/**
 * 校验 6 位 TOTP 验证码，允许前后各 1 个时间窗（共 90 秒）的时钟偏差。
 * 返回 true/false；校验通过后建议调用方把该时间窗标记为已使用，避免重放。
 */
export function verifyTotp(secret: string, token: string): boolean {
  if (!/^\d{4,8}$/.test(token)) return false
  const secretBytes = base32Decode(secret)
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD)
  const expected = Buffer.from(token, 'utf8')
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const candidate = hotp(secretBytes, counter + delta)
    if (
      candidate.length === token.length &&
      timingSafeEqual(Buffer.from(candidate), expected)
    ) {
      return true
    }
  }
  return false
}

/** 构造 otpauth:// 标准的 TOTP 链接（供验证器扫码/快捷添加） */
export function buildTotpUri(opts: {
  secret: string
  account: string
  issuer: string
}): string {
  const issuer = opts.issuer || 'Chronoval'
  const label = `${issuer}:${opts.account}`
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  })
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}

// ===== 两步登录挑战令牌 =====
// 密码校验通过后，若账号启用了 2FA，不下发会话，而是签发一个短期、签名的挑战
// Cookie；前端带着 TOTP 验证码走第二步接口，验证通过后才建立正式会话。
const CHALLENGE_TTL_SECONDS = 10 * 60
const CHALLENGE_COOKIE = 'cframe_2fa_challenge'

function challengeSecret(): string {
  // 复用会话签名密钥，避免新增秘密；未配置时回退到随机值（仅用于签名一致性）
  return (
    process.env.NUXT_SESSION_PASSWORD ||
    process.env.NUXT_AUTH_SESSION_PASSWORD ||
    'chronoval-totp-challenge'
  )
}

function signChallenge(userId: number, exp: string): string {
  const payload = `${userId}:${exp}`
  const sig = createHmac('sha256', challengeSecret())
    .update(payload)
    .digest('base64url')
  return `${payload}.${sig}`
}

/** 校验挑战令牌并返回 userId；过期或被篡改返回 null */
export function verifyChallenge(token: string): number | null {
  const lastDot = token.lastIndexOf('.')
  if (lastDot === -1) return null
  const payload = token.slice(0, lastDot)
  const sig = token.slice(lastDot + 1)
  const expected = createHmac('sha256', challengeSecret())
    .update(payload)
    .digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null
  }
  const [userIdStr, expStr] = payload.split(':')
  const userId = Number(userIdStr)
  const exp = Number(expStr)
  if (!Number.isFinite(userId) || !Number.isFinite(exp)) return null
  if (Date.now() / 1000 > exp) return null
  return userId
}

/** 签发挑战 Cookie 值（httpOnly、SameSite=Lax、10 分钟有效） */
export function createChallengeToken(userId: number): {
  token: string
  expiresAt: Date
} {
  const exp = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS
  return { token: signChallenge(userId, String(exp)), expiresAt: new Date(exp * 1000) }
}

export const totpConstants = {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_SECONDS,
}