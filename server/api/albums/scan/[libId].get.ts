import { z } from 'zod'
import {
  getScanLibraryByKey,
  getScanAlbumDetail,
  getScanAlbumEffectivePasswordHash,
} from '~~/server/services/scan-library/manager'
import { hasScanAlbumAccess } from '~~/server/utils/scanAlbumAuth'
import { settingsManager } from '~~/server/services/settings/settingsManager'

export default eventHandler(async (event) => {
  const { libId } = await getValidatedRouterParams(
    event,
    z.object({ libId: z.string() }).parse,
  )
  const query = await getValidatedQuery(
    event,
    z.object({ path: z.string().optional().default('') }).parse,
  )

  const lib = getScanLibraryByKey(libId)
  if (!lib || !lib.asAlbum || !lib.enabled) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  const libIdNum = lib.id

  const detail = await getScanAlbumDetail(libIdNum, query.path)
  if (!detail) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  // 相簿级生效密码：自身 meta 优先，未设置则向上继承/回退到扫描库旧密码
  const passwordHash = await getScanAlbumEffectivePasswordHash(
    libIdNum,
    query.path,
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
    { libId: libIdNum, relPath: query.path, passwordHash },
    Boolean(adminBypass),
  )

  const passwordProtected = Boolean(detail.node.passwordProtected)

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
      node: stripPassword(detail.node),
      dirPhotos: [],
      children: [],
      passwordProtected: true,
      authorized: false,
    }
  }

  return {
    ...detail,
    node: stripPassword(detail.node),
    children: detail.children.map(stripPassword),
    passwordProtected,
    authorized,
  }
})