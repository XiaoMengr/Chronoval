import { z } from 'zod'
import {
  getScanLibraryByKey,
  getScanAlbumEffectivePasswordHash,
} from '~~/server/services/scan-library/manager'
import { getScanAlbumMetaByUrlKey } from '~~/server/services/scan-library/album-meta'
import { authorizeScanAlbum } from '~~/server/utils/scanAlbumAuth'
import { verifyAlbumPassword } from '~~/server/utils/scanAlbumPassword'
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
  const body = await readValidatedBody(
    event,
    z.object({ password: z.string() }).parse,
  )

  // 与 GET 一致：先按相簿自身 urlKey 定位，命中则用其 mount/relPath
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
    relPath = byMetaUrl.relPath || ''
  } else {
    const lib = getScanLibraryByKey(libId)
    if (!lib || !lib.asAlbum || !lib.enabled) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    libIdNum = lib.id
    relPath = query.path
  }

  const passwordHash = await getScanAlbumEffectivePasswordHash(
    libIdNum,
    relPath,
  )

  // 管理员的「免密访问」只有在显式开启对应系统设置时才放行；
  // 默认关闭：即使登录管理员，也必须输入正确相簿密码。
  const session = await getUserSession(event)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)
  const adminBypass =
    isAdmin &&
    (await settingsManager.get<boolean>('system', 'scanAlbum.adminBypass', false))

  if (adminBypass) {
    authorizeScanAlbum(event, {
      libId: libIdNum,
      relPath,
      passwordHash,
    })
    return { authorized: true }
  }

  if (!passwordHash || !(await verifyAlbumPassword(passwordHash, body.password))) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect password' })
  }

  authorizeScanAlbum(event, { libId: libIdNum, relPath, passwordHash })
  return { authorized: true }
})