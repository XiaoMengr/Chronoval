import { z } from 'zod'
import { authorizeAlbum } from '~~/server/utils/manualAlbumAuth'
import { verifyAlbumPassword } from '~~/server/utils/scanAlbumPassword'
import { settingsManager } from '~~/server/services/settings/settingsManager'

export default eventHandler(async (event) => {
  // 支持数字 id（兼容存量）与不透明 uid 两种公开标识访问
  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({ albumId: z.string().min(1) }).parse,
  )

  const body = await readValidatedBody(
    event,
    z.object({ password: z.string() }).parse,
  )

  const db = useDB()

  const albumIdNum = /^\d+$/.test(albumId) ? parseInt(albumId, 10) : null
  const album = albumIdNum != null
    ? db
        .select()
        .from(tables.albums)
        .where(eq(tables.albums.id, albumIdNum))
        .get()
    : db
        .select()
        .from(tables.albums)
        .where(eq(tables.albums.uid, albumId))
        .get()

  if (!album) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  // 解锁 Cookie 统一绑定内部整数 id，与详情接口的授权判定一致
  const albumPk = album.id

  // 管理员的「免密访问」只有在显式开启对应系统设置时才放行；
  // 默认关闭：即使登录管理员，也必须输入正确相簿密码。
  const session = await getUserSession(event)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)
  const adminBypass =
    isAdmin &&
    (await settingsManager.get<boolean>('system', 'scanAlbum.adminBypass', false))

  if (adminBypass) {
    authorizeAlbum(event, { albumId: albumPk, passwordHash: album.passwordHash })
    return { authorized: true }
  }

  if (!album.passwordHash || !(await verifyAlbumPassword(album.passwordHash, body.password))) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect password' })
  }

  authorizeAlbum(event, { albumId: albumPk, passwordHash: album.passwordHash })
  return { authorized: true }
})