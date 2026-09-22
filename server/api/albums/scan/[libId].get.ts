import { z } from 'zod'
import {
  getScanLibraryByKey,
  getScanAlbumDetail,
  getScanAlbumEffectivePasswordHash,
} from '~~/server/services/scan-library/manager'
import { getScanAlbumMetaByUrlKey } from '~~/server/services/scan-library/album-meta'
import { hasScanAlbumAccess } from '~~/server/utils/scanAlbumAuth'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import { resolveRandomQuotesPool } from '~~/server/services/settings/quoteLibraries'

export default eventHandler(async (event) => {
  const { libId } = await getValidatedRouterParams(
    event,
    z.object({ libId: z.string() }).parse,
  )
  const query = await getValidatedQuery(
    event,
    z.object({ path: z.string().optional().default('') }).parse,
  )

  // 预载音乐盒 BGM，用于相簿节点回显
  const { serializeMusic, listMusic } = await import('~~/server/services/music')
  const musicMap = new Map<number, ReturnType<typeof serializeMusic>>()
  for (const m of await listMusic()) {
    musicMap.set(m.id, serializeMusic(m))
  }
  const resolveBgm = (bgmMusicId?: number | null) =>
    (bgmMusicId && musicMap.get(bgmMusicId)) || null

  // 解析目标相簿对（libIdNum, relPath）：
  // 1) 先尝试按相簿自身 urlKey 定位 —— 命中则返回该相簿（mount+relPath），忽略 path 参数；
  // 2) 否则按扫描库级 urlKey / 数字 id 定位，配合 path 定位到具体目录相簿。
  const byMetaUrl = await getScanAlbumMetaByUrlKey(libId)
  let libIdNum: number
  let relPath: string
  if (byMetaUrl) {
    const parsed = Number(byMetaUrl.mount.replace(/^scan_/, ''))
    if (!Number.isFinite(parsed)) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    const lib = getScanLibraryByKey(String(parsed))
    if (!lib || !lib.asAlbum || !lib.enabled) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    libIdNum = lib.id
    // urlKey 标识的相簿可能是某目录层，公开链接 /albums/scan/{urlKey}/{子路径...} 可继续向下钻取；
    // 因此在基础 relPath 之上叠加 query.path，否则点击其子相簿会被错误地解析回父相簿（表现为“打不开”）。
    relPath = query.path
      ? [byMetaUrl.relPath || '', query.path].filter(Boolean).join('/')
      : byMetaUrl.relPath || ''
  } else {
    const lib = getScanLibraryByKey(libId)
    if (!lib || !lib.asAlbum || !lib.enabled) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    libIdNum = lib.id
    relPath = query.path
  }

  const detail = await getScanAlbumDetail(libIdNum, relPath)
  if (!detail) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  // 相簿级生效密码：自身 meta 优先，未设置则向上继承/回退到扫描库旧密码
  const passwordHash = await getScanAlbumEffectivePasswordHash(
    libIdNum,
    relPath,
  )
  // 访问权只认「解锁 cookie」或显式开启的「管理员免密」开关；
  // 默认不因管理员身份放行，避免「任意密码都可进入」。
  const session = await getUserSession(event)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)
  const adminBypass =
    isAdmin &&
    (await settingsManager.get<boolean>('system', 'scanAlbum.adminBypass', false))
  const authorized = hasScanAlbumAccess(
    event,
    { libId: libIdNum, relPath, passwordHash },
    Boolean(adminBypass),
  )

  const passwordProtected = Boolean(detail.node.passwordProtected)

  // 「随机照片轮经典语录」最终生效语录池：标签优先（内置古诗/现代库），否则自定义，两者皆无则空（旋转时不显示）
  const withRandomQuotePool = async (node: any): Promise<any> => {
    const pool = await resolveRandomQuotesPool(
      node.randomQuotesTag,
      node.randomQuotes,
    )
    const { password: _pw, children, ...rest } = stripPassword(node)
    const withBgm = { ...rest, bgm: resolveBgm(rest.bgmMusicId) }
    return children?.length
      ? { ...withBgm, children: await Promise.all(children.map(withRandomQuotePool)), randomQuotesPool: pool }
      : { ...withBgm, randomQuotesPool: pool }
  }

  // 无论解锁与否，公开返回的节点都不带明文密码（明文仅供管理端编辑面板回显）
  const stripPassword = (node: any): any => {
    const { password: _pw, children, ...rest } = node
    return children?.length
      ? { ...rest, children: children.map(stripPassword) }
      : rest
  }

  // 未解锁的受保护相簿仅返回节点信息用于标题/封面展示，不返回目录照片与子相簿
  if (passwordProtected && !authorized) {
    return {
      node: await withRandomQuotePool(detail.node),
      dirPhotos: [],
      children: [],
      passwordProtected: true,
      authorized: false,
    }
  }

  return {
    ...detail,
    node: await withRandomQuotePool(detail.node),
    children: await Promise.all(detail.children.map(withRandomQuotePool)),
    passwordProtected,
    authorized,
  }
})