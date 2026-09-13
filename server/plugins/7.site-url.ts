import { settingsManager } from '../services/settings/settingsManager'
import { normalizeSiteUrl } from '../utils/site-url'

export default defineNitroPlugin(async () => {
  // 将基础设置中的 站点地址 / 允许主机 同步进运行时配置，
  // 方便服务端逻辑（分享、OG、日志）读取。读取失败时静默回退到环境变量。
  try {
    const publicConfig = useRuntimeConfig().public as Record<string, unknown>

    const siteUrl: string =
      (await settingsManager.get<string>('app', 'siteUrl'))?.trim() ||
      process.env.NUXT_PUBLIC_SITE_URL ||
      ''

    const allowedHosts: string =
      (await settingsManager.get<string>('app', 'allowedHosts'))?.trim() ||
      process.env.NUXT_ALLOWED_HOSTS ||
      ''

    const canonical: string = normalizeSiteUrl(siteUrl)
    publicConfig.siteUrl = canonical
    publicConfig.allowedHosts = allowedHosts

    if (canonical) {
      const afterScheme = canonical.replace(/^[a-z]+:\/\//i, '')
      const hostWithPath = afterScheme.split('/').shift()!
      const siteHost = hostWithPath.split(':').shift()!
      console.info(
        `[site-url] 站点规范地址已配置: ${canonical}` +
          `（允许主机: ${[allowedHosts, siteHost].filter(Boolean).join(', ')}）`,
      )
    }
  } catch (error) {
    console.warn('[site-url] 读取站点配置失败:', error)
  }
})