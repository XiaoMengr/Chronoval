import type { H3Event } from 'h3'
import { settingsManager } from '../services/settings/settingsManager'

/**
 * 站点规范地址（无尾随斜杠），用于分享链接与 OG 图地址。
 * 优先级：设置中的 app.siteUrl（可在基础设置/环境变量 NUXT_PUBLIC_SITE_URL 配置）
 * 无配置时返回 ''，表示跟随当前访问域名。
 */
export async function resolveSiteUrl(): Promise<string> {
  const configured =
    (await settingsManager.get<string>('app', 'siteUrl')) ||
    process.env.NUXT_PUBLIC_SITE_URL ||
    ''
  return normalizeSiteUrl(configured)
}

/** 去掉尾随斜杠，保证与 requestURL 拼接不产生双斜杠 */
export function normalizeSiteUrl(url: string): string {
  if (!url) return ''
  return url.replace(/\/+$/, '')
}

/**
 * 当前请求的完整站点原始地址（含协议/端口），无尾随斜杠。
 * 未配置规范地址时用它作为分享/OG 的基础地址。
 */
export function resolveRequestOrigin(event: H3Event): string {
  const url = getRequestURL(event)
  return normalizeSiteUrl(url.origin)
}

/**
 * 取用于分享/OG 的最终基础地址：
 * 配置了 app.siteUrl 则使用之（固定规范地址，内网/IP 部署也稳定），否则用当前请求 origin。
 */
export function resolveShareBaseUrl(event: H3Event, configuredUrl: string): string {
  const siteUrl = normalizeSiteUrl(configuredUrl)
  if (siteUrl) return siteUrl
  return resolveRequestOrigin(event)
}