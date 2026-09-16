import { z } from 'zod'
import {
  getScanLibraryByKey,
  getScanAlbumEffectivePasswordHash,
} from '~~/server/services/scan-library/manager'
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

  const lib = getScanLibraryByKey(libId)
  if (!lib || !lib.asAlbum || !lib.enabled) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  const libIdNum = lib.id

  const passwordHash = await getScanAlbumEffectivePasswordHash(
    libIdNum,
    query.path,
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
      relPath: query.path,
      passwordHash,
    })
    return { authorized: true }
  }

  if (!passwordHash || !(await verifyAlbumPassword(passwordHash, body.password))) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect password' })
  }

  authorizeScanAlbum(event, { libId: libIdNum, relPath: query.path, passwordHash })
  return { authorized: true }
})