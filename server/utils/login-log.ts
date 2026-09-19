/**
 * 登入记录写入工具：在登录/两步验证/github 授权等流程中调用，把每次登入尝试落库。
 * 供账户安全设置页的「登入记录」审计展示使用。
 */
import type { H3Event } from 'h3'
import { and, desc, eq, isNull } from 'drizzle-orm'

export type LoginLogMethod = 'password' | 'two-factor' | 'github'
export type LoginLogStatus = 'success' | 'failed' | 'challenge'

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

  db.insert(tables.loginLogs)
    .values({
      userId: opts.userId,
      email: opts.email,
      ip,
      userAgent,
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