import { z } from 'zod'
import {
  getScanLibraryByKey,
  getScanAlbumEffectivePasswordHash,
  getScanAlbumEffectiveAuth,
} from '~~/server/services/scan-library/manager'
import { getScanAlbumMetaByUrlKey } from '~~/server/services/scan-library/album-meta'
import {
  authorizeScanAlbum,
  authorizeScanLibrary,
} from '~~/server/utils/scanAlbumAuth'
import { isPasswordExemptForUser } from '~~/server/utils/albumPasswordExempt'
import { verifyAlbumPassword } from '~~/server/utils/scanAlbumPassword'
import { settingsManager } from '~~/server/services/settings/settingsManager'

/** 签发库级解锁 cookie：任一次正确解锁后，会话内整个扫描库免密（无需逐相簿重复输入） */
const authorizeScanLibraryUnlock = async (
  event: any,
  libIdNum: number,
): Promise<void> => {
  const libPasswordHash = await getScanAlbumEffectivePasswordHash(libIdNum, '')
  authorizeScanLibrary(event, libIdNum, libPasswordHash)
}

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
    if (!lib || lib.displayMode === 'gallery' || !lib.enabled) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    libIdNum = lib.id
    relPath = byMetaUrl.relPath || ''
  } else {
    const lib = getScanLibraryByKey(libId)
    if (!lib || lib.displayMode === 'gallery' || !lib.enabled) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    libIdNum = lib.id
    relPath = query.path
  }

  const effAuth = await getScanAlbumEffectiveAuth(libIdNum, relPath)
  const passwordHash = effAuth.passwordHash

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
    await authorizeScanLibraryUnlock(event, libIdNum)
    return { authorized: true }
  }

  // 登录用户在相簿配置的免密范围内（所有登录用户/指定用户）：无需密码直接签发解锁 Cookie
  if (
    isPasswordExemptForUser(
      {
        passwordHash,
        passwordExemptMode: effAuth.exemptMode,
        passwordExemptUsers: effAuth.exemptUsers,
      },
      (session as any)?.user,
    )
  ) {
    authorizeScanAlbum(event, { libId: libIdNum, relPath, passwordHash })
    await authorizeScanLibraryUnlock(event, libIdNum)
    return { authorized: true }
  }

  if (!passwordHash || !(await verifyAlbumPassword(passwordHash, body.password))) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect password' })
  }

  authorizeScanAlbum(event, { libId: libIdNum, relPath, passwordHash })
  await authorizeScanLibraryUnlock(event, libIdNum)
  return { authorized: true }
})