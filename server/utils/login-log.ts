/**
 * 登入记录写入工具：在登录/两步验证/github 授权等流程中调用，把每次登入尝试落库。
 * 供账户安全设置页的「登入记录」审计展示使用。
 */
import type { H3Event } from 'h3'
import { and, desc, eq, isNull } from 'drizzle-orm'
// geoip-lite 为 CommonJS 包（内置离线 GeoIP 库），其类型仅提供具名导出，这里以默认导出拿到运行时对象
import geoipLite from 'geoip-lite'

type GeoipLookupResult = {
  country: string
  region: string
  city: string
} | null
const geoipLookup = (geoipLite as unknown as { lookup(ip: string): GeoipLookupResult }).lookup

export type LoginLogMethod = 'password' | 'two-factor' | 'github'
export type LoginLogStatus = 'success' | 'failed' | 'challenge'

interface GeoInfo {
  country: string | null
  region: string | null
  city: string | null
}

/** 利用内置离线 GeoIP 库解析 IP 归属地；内网/环回/解析不到返回 null */
function resolveGeo(ip: string | null | undefined): GeoInfo | null {
  if (!ip) return null
  const clean = ip.replace(/^::ffff:/, '').toLowerCase()
  if (clean === '::1' || clean === 'localhost' || clean.startsWith('127.')) return null
  // 常见私网 / 保留段快速排除
  if (
    clean.startsWith('10.') ||
    clean.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(clean)
  )
    return null

  const hit = geoipLookup(clean)
  if (!hit) return null
  return {
    country: hit.country || null,
    region: hit.region || null,
    city: hit.city || null,
  }
}

interface RecordOptions {
  /** 关联用户 id；未知账户（登录邮箱不存在）可省略 */
  userId?: number
  /** 尝试登入的邮箱（必填，未知账户的失败足迹也据此留存） */
  email: string
  method?: LoginLogMethod
  status: LoginLogStatus
}

/** 提取客户端 IP（反向代理后取真实地址；获取不到则为 null） */
function resolveIp(event: H3Event): string | null {
  try {
    return getRequestIP(event, { xForwardedFor: true }) ?? null
  } catch {
    return null
  }
}

/** 写入一条登入记录（获取到的 IP/UA 仅用于审计展示） */
export function recordLoginAttempt(event: H3Event, opts: RecordOptions) {
  const db = useDB()
  const ip = resolveIp(event)
  const userAgent = getRequestHeader(event, 'user-agent') ?? null
  const geo = resolveGeo(ip)

  db.insert(tables.loginLogs)
    .values({
      userId: opts.userId,
      email: opts.email,
      ip,
      userAgent,
      country: geo?.country ?? null,
      region: geo?.region ?? null,
      city: geo?.city ?? null,
      method: opts.method ?? 'password',
      status: opts.status,
    })
    .run()
}

/**
 * 两步验证成功后，把对应账户最近一条「challenge（密码正确待验证）」记录改为成功。
 * 使登入记录呈现为一条完整的成功登录，而不是残留的待验证条目。
 */
export function markChallengeAsSucceeded(event: H3Event, userId: number, email: string) {
  const db = useDB()
  const ip = resolveIp(event)
  db.update(tables.loginLogs)
    .set({ status: 'success', method: 'two-factor', email })
    .where(
      and(
        eq(tables.loginLogs.userId, userId),
        eq(tables.loginLogs.status, 'challenge'),
        ip ? eq(tables.loginLogs.ip, ip) : isNull(tables.loginLogs.ip),
      ),
    )
    .orderBy(desc(tables.loginLogs.createdAt))
    .limit(1)
    .run()
}