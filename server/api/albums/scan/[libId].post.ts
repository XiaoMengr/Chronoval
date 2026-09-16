import { z } from 'zod'
import {
  getScanLibraryByKey,
  getScanAlbumEffectivePasswordHash,
} from '~~/server/services/scan-library/manager'
import {
  authorizeScanAlbum,
} from '~~/server/utils/scanAlbumAuth'

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

  const session = await getUserSession(event)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)
  if (isAdmin) {
    authorizeScanAlbum(event, { libId: libIdNum, relPath: query.path, passwordHash })
    return { authorized: true }
  }

  if (!passwordHash || !(await verifyPassword(passwordHash, body.password))) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect password' })
  }

  authorizeScanAlbum(event, { libId: libIdNum, relPath: query.path, passwordHash })
  return { authorized: true }
})