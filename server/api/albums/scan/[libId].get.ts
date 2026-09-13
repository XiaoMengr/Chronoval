import { z } from 'zod'
import {
  getScanLibraryRow,
  getScanAlbumDetail,
  getScanAlbumEffectivePasswordHash,
} from '~~/server/services/scan-library/manager'
import { hasScanAlbumAccess } from '~~/server/utils/scanAlbumAuth'

export default eventHandler(async (event) => {
  const { libId } = await getValidatedRouterParams(
    event,
    z.object({ libId: z.string().transform((v) => parseInt(v, 10)) }).parse,
  )
  const query = await getValidatedQuery(
    event,
    z.object({ path: z.string().optional().default('') }).parse,
  )

  const lib = getScanLibraryRow(libId)
  if (!lib || !lib.asAlbum || !lib.enabled) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const session = await getUserSession(event)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)

  const detail = await getScanAlbumDetail(libId, query.path)
  if (!detail) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  // 相簿级生效密码：自身 meta 优先，未设置则向上继承/回退到扫描库旧密码
  const passwordHash = await getScanAlbumEffectivePasswordHash(
    libId,
    query.path,
  )
  const authorized = hasScanAlbumAccess(
    event,
    { libId, relPath: query.path, passwordHash },
    isAdmin,
  )

  const passwordProtected = Boolean(detail.node.passwordProtected)

  // 未解锁的受保护相簿仅返回节点信息用于标题/封面展示，不返回目录照片与子相簿
  if (passwordProtected && !authorized) {
    return {
      node: detail.node,
      dirPhotos: [],
      children: [],
      passwordProtected: true,
      authorized: false,
    }
  }

  return {
    ...detail,
    passwordProtected,
    authorized,
  }
})