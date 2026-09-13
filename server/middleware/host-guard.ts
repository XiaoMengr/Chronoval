import type { H3Event } from 'h3'
import { settingsManager } from '../services/settings/settingsManager'

/**
 * 请求来源 Host 白名单守护（运行时生效，无需重启）。
 *
 * 背景：Nuxt/Nitro 内置的 `server.allowedHosts` 只在启动时从环境变量读取，
 * 无法反映「基础设置」里的修改，内网/IP 部署时非白名单 Host 会被直接 403 拦截，
 * 导致 OG 分享图/整站无法访问。因此 transport 层对整个 Host 放行
 * （见 nuxt.config.ts 中 `server.allowedHosts: true`），
 * 权限判断统一交给本中间件：
 *
 *   1. 优先读取基础设置 `app.allowedHosts`（保存后立即生效，无需重启）；
 *   2. 未设置时回退到环境变量 `NUXT_ALLOWED_HOSTS`；
 *   3. 仍为空时使用「内置安全默认值 + 站点地址」。
 *
 * 支持 `*` 放行所有、`*.domain` 通配符、域名/IP。
 * 匹配时使用 Host 头，并兼容反代场景下的 X-Forwarded-Host。
 */

interface HostRules {
  allowAll: boolean
  hosts: string[]
}

// 内置安全默认值：本机 + 原有 frp/caddy 反代场景，均可通过环境变量或设置扩展
const DEFAULT_HOSTS = [
  'localhost',
  '127.0.0.1',
  '[::1]',
  '::1',
  'dev.1xc.top',
  '.1xc.top',
]

function normalizeRule(rule: string): string {
  return rule.trim().toLowerCase()
}

/** 判断单个 hostname 是否匹配某条规则（支持 *.domain / 精确域名 / IP） */
function matchHost(hostname: string, rule: string): boolean {
  if (!rule) return false
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(1) // '.domain'
    return hostname.endsWith(suffix)
  }
  return hostname === rule
}

/** 解析最终 Host 白名单规则 */
async function resolveHostRules(event: H3Event): Promise<HostRules> {
  // 1. 基础设置 app.allowedHosts（可运行时修改）
  let list = ''
  try {
    list = (await settingsManager.get<string>('app', 'allowedHosts')) || ''
  } catch {
    list = ''
  }

  // 2. 回退环境变量
  if (!list.trim()) {
    list = process.env.NUXT_ALLOWED_HOSTS || ''
  }

  // 3. 追加站点地址派生主机（优先取基础设置 app.siteUrl，其次环境变量）
  let siteUrl = process.env.NUXT_PUBLIC_SITE_URL || ''
  try {
    siteUrl = (await settingsManager.get<string>('app', 'siteUrl'))?.trim() || siteUrl
  } catch {
    // 保持环境变量值
  }
  let siteHost = ''
  if (siteUrl) {
    try {
      siteHost = new URL(siteUrl).hostname.toLowerCase()
    } catch {
      siteHost = siteUrl.toLowerCase()
    }
  }

  const raw = `${list},${DEFAULT_HOSTS.join(',')},${siteHost}`
  const hosts = raw
    .split(',')
    .map(normalizeRule)
    .filter(Boolean)

  const allowAll =
    list.split(',').map(normalizeRule).includes('*') ||
    process.env.NUXT_ALLOW_ALL_HOSTS === 'true'

  return { allowAll, hosts }
}

export default defineEventHandler(async (event) => {
  const host = getRequestHost(event, { xForwardedHost: true })
  const hostname = (host || '').split(':')[0]
  if (!hostname) return

  const { allowAll, hosts } = await resolveHostRules(event)
  if (allowAll) return

  const normalizedHost = hostname.toLowerCase()
  if (hosts.some((rule) => matchHost(normalizedHost, rule))) return

  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[host-guard] 拒绝访问（Host 不在白名单）: ${hostname}`)
  }
  throw createError({
    statusCode: 403,
    statusMessage: 'Host not allowed',
  })
})