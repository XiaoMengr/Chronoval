import { z } from 'zod'
import { authorizeAlbum } from '~~/server/utils/manualAlbumAuth'
import { verifyAlbumPassword } from '~~/server/utils/scanAlbumPassword'
import { settingsManager } from '~~/server/services/settings/settingsManager'

export default eventHandler(async (event) => {
  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({
      albumId: z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10)),
    }).parse,
  )

  const body = await readValidatedBody(
    event,
    z.object({ password: z.string() }).parse,
  )

  const db = useDB()
  const album = db
    .select()
    .from(tables.albums)
    .where(eq(tables.albums.id, albumId))
    .get()

  if (!album) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  // 管理员的「免密访问」只有在显式开启对应系统设置时才放行；
  // 默认关闭：即使登录管理员，也必须输入正确相簿密码。
  const session = await getUserSession(event)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)
  const adminBypass =
    isAdmin &&
    (await settingsManager.get<boolean>('system', 'scanAlbum.adminBypass', false))

  if (adminBypass) {
    authorizeAlbum(event, { albumId, passwordHash: album.passwordHash })
    return { authorized: true }
  }

  if (!album.passwordHash || !(await verifyAlbumPassword(album.passwordHash, body.password))) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect password' })
  }

  authorizeAlbum(event, { albumId, passwordHash: album.passwordHash })
  return { authorized: true }
})