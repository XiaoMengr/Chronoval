import { settingsManager } from '../services/settings/settingsManager'
import { normalizeSiteUrl } from '../utils/site-url'

interface SiteConfigStackInitCtx {
  siteConfig: {
    push: (input: Record<string, unknown>) => void
  }
  event: {
    context?: {
      siteConfigNitroOrigin?: string
    }
  }
}

export default defineNitroPlugin(async (nitroApp) => {
  // nuxt-og-image 等模块通过 nuxt-site-config 的 site-config 栈解析规范地址
  // （withSiteUrl -> getNitroOrigin）。该栈在运行时默认按请求来源推导协议：
  // 生产环境会把非 localhost 主机强制为 https，反代也会带 x-forwarded-proto=https。
  // 同时，开发模式下 withSiteUrl 直接用 nitroOrigin（请求来源）而非站点栈。
  // 这里在 site-config:init（每次请求初始化栈，晚于 nitro/runtime 默认入栈）时，
  // 把基础设置中的站点地址（保留用户显式写的 http:// 协议）以更高优先级重新入栈，
  // 并顺带覆盖请求的 nitroOrigin，从而让 OG 分享图/分享链接在开发与生产、
  // 内网 IP/反代域名等场景下都固定使用用户自定义的协议（如内网 http://IP:port）。
  nitroApp.hooks.hook('site-config:init', (ctx: SiteConfigStackInitCtx) => {
    settingsManager
      .get<string>('app', 'siteUrl')
      .then((siteUrl) => {
        const canonical: string =
          normalizeSiteUrl(siteUrl?.trim() || '') ||
          normalizeSiteUrl(process.env.NUXT_PUBLIC_SITE_URL || '')
        if (!canonical) return
        ctx.siteConfig.push({
          _context: 'chronoval:app-site-url',
          _priority: 1, // 高于 nitro(-4) / runtime(0)，保证覆盖默认协议推导
          url: canonical,
        })
        // 开发模式下 withSiteUrl 使用 nitroOrigin：覆盖为已配置的规范地址，
        // 确保 http/IP:port 自定义地址也能被 OG 分享图接受。
        if (ctx.event?.context) {
          ctx.event.context.siteConfigNitroOrigin = canonical
        }
        console.info(
          `[site-url] site-config 栈 + nitroOrigin 已应用规范地址: ${canonical}`,
        )
      })
      .catch((error) => {
        console.warn('[site-url] 同步站点地址到 site-config 失败:', error)
      })
  })

  // 同步基础设置中的 站点地址 / 允许主机 进运行时公共配置，
  // 供客户端（分享链接、OG 地址等）与常见服务端逻辑读取。
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