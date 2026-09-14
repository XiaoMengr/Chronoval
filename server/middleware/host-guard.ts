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

/** 生成自包含的醒目拦截页（浏览器请求直接返回，不依赖 error.vue 管线） */
function renderBlockedPage(host: string): string {
  const title = '无法访问此站点'
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>403 ${title}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{height:100%}
  body{display:grid;place-items:center;padding:24px;font-family:ui-sans-serif,system-ui,-apple-system,'PingFang SC',sans-serif;
    --bg:#f4f3f1;--panel:#ffffff;--border:rgba(0,0,0,.06);--ink:#1c1917;--muted:#57534e;--dim:#a8a29e;
    --accent:#d97706;--accent-soft:rgba(245,158,11,.14);--shadow:0 20px 60px rgba(20,20,24,.12);
    background:
      radial-gradient(52rem 34rem at 15% -10%,rgba(245,158,11,.10),transparent 55%),
      radial-gradient(46rem 30rem at 90% 0%,rgba(220,38,38,.06),transparent 55%),var(--bg);
    color:var(--ink)}
  @media (prefers-color-scheme:dark){
    body{--bg:#0f0f12;--panel:#151518;--border:rgba(255,255,255,.08);--ink:#f5f5f4;--muted:#a8a29e;--dim:#57534e;
      --accent:#fbbf24;--accent-soft:rgba(245,158,11,.16);--shadow:0 20px 60px rgba(0,0,0,.5)}
  }
  .card{width:100%;max-width:560px;background:var(--panel);border:1px solid var(--border);border-radius:20px;
    padding:40px 32px;text-align:center;box-shadow:var(--shadow)}
  .icon{width:64px;height:64px;margin:0 auto;border-radius:16px;background:var(--accent-soft);
    display:flex;align-items:center;justify-content:center}
  .icon svg{width:32px;height:32px;stroke:var(--accent);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .kicker{margin-top:20px;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
  h1{margin-top:8px;font-size:26px;font-weight:800;letter-spacing:-.01em;color:var(--ink)}
  p.desc{margin:14px auto 0;max-width:440px;font-size:15px;line-height:1.7;color:var(--muted)}
  code.host{margin:12px auto 0;display:inline-block;max-width:100%;overflow-wrap:break-word;padding:6px 12px;
    border-radius:8px;background:var(--accent-soft);color:var(--accent);font-family:ui-monospace,SFMono-Regular,monospace;
    font-size:13px;font-weight:700;word-break:break-all}
  .steps{margin-top:22px;padding:16px 18px;text-align:left;border-radius:14px;background-color:rgba(0,0,0,0.02)}
  @media (prefers-color-scheme:dark){.steps{background-color:rgba(255,255,255,.05)}}
  .steps b{font-size:12px;color:var(--ink)}
  .steps ul{margin:10px 0 0;padding-left:0;list-style:none;font-size:13px;line-height:1.7;color:var(--muted)}
  .steps li{padding:8px 0 8px 18px;position:relative}
  .steps li::before{content:"";position:absolute;left:2px;top:15px;width:6px;height:6px;border-radius:50%;background:var(--accent)}
  .steps em{color:var(--accent);font-style:normal;font-weight:600}
  .steps code{font-family:ui-monospace,monospace;font-size:12px;background:var(--accent-soft);color:var(--accent);
    padding:1px 5px;border-radius:5px;word-break:break-all}
  .btns{margin-top:26px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
  .btn{cursor:pointer;border:none;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:600;text-decoration:none}
  .btn.primary{background:var(--accent);color:#fff;box-shadow:0 8px 20px rgba(217,119,6,.30)}
  .btn.ghost{background:transparent;border:1px solid var(--border);color:var(--muted)}
  .foot{margin-top:22px;font-size:11px;color:var(--dim)}
</style>
</head>
<body>
  <main class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-2.8 8.2-7 10-4.2-1.8-7-5.5-7-10V6l7-3z" opacity=".55"/><path d="M9.3 9.3l5.4 5.4M14.7 9.3l-5.4 5.4"/></svg>
    </div>
    <p class="kicker">访问受限 · Host blocked</p>
    <h1>${title}</h1>
    <p class="desc">当前入口的主机（Host）未加入允许列表，本站暂时拒绝响应。</p>
    <code class="host">${host}</code>
    <div class="steps">
      <b>如何放行当前 Host？</b>
      <ul>
        <li><em>方式一（推荐）</em>：后台“设置 → 基础设置 → 允许访问的主机”中加入 <code>${host}</code>，保存即生效、无需重启。</li>
        <li><em>方式二</em>：部署时用环境变量 <code>NUXT_ALLOWED_HOSTS</code> 加入该 Host（逗号分隔），如 <code>NUXT_ALLOWED_HOSTS="${host},dev.1xc.top"</code>，重启容器生效。</li>
      </ul>
    </div>
    <div class="btns">
      <a class="btn primary" href="javascript:location.reload()">重新加载</a>
      <a class="btn ghost" href="/">返回站点首页</a>
    </div>
    <p class="foot">Host blocked · ${host}</p>
  </main>
</body>
</html>`
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

  // 浏览器（接受 HTML）直接返回醒目的自包含提示页；其它客户端回退到结构化错误
  const accept = getRequestHeader(event, 'accept') || ''
  if (accept.includes('text/html')) {
    setResponseStatus(event, 403)
    setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
    return renderBlockedPage(host || hostname)
  }

  throw createError({
    statusCode: 403,
    statusMessage: 'Host not allowed',
    message: `Host ${hostname} is not allowed`,
    data: { code: 'HOST_NOT_ALLOWED', host: (host || hostname) },
  })
})