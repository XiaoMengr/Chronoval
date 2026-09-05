import { z } from 'zod'
import { getScanLibraryRow, getScanAlbumDetail } from '~~/server/services/scan-library/manager'
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

  const authorized = hasScanAlbumAccess(event, lib, isAdmin)

  // 未解锁的受保护相簿仅返回节点信息用于标题/封面展示，不返回目录照片与子相簿
  if (lib.passwordHash && !authorized) {
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
    passwordProtected: Boolean(lib.passwordHash),
    authorized,
  }
})