import { z } from 'zod'
import { getScanLibraryRow } from '~~/server/services/scan-library/manager'
import {
  hasScanAlbumAccess,
  authorizeScanAlbum,
} from '~~/server/utils/scanAlbumAuth'

export default eventHandler(async (event) => {
  const { libId } = await getValidatedRouterParams(
    event,
    z.object({ libId: z.string().transform((v) => parseInt(v, 10)) }).parse,
  )
  const body = await readValidatedBody(
    event,
    z.object({ password: z.string() }).parse,
  )

  const lib = getScanLibraryRow(libId)
  if (!lib || !lib.asAlbum || !lib.enabled) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const session = await getUserSession(event)
  const isAdmin = Boolean((session as any)?.user?.isAdmin)
  if (isAdmin) {
    authorizeScanAlbum(event, lib)
    return { authorized: true }
  }

  if (!lib.passwordHash || !(await verifyPassword(lib.passwordHash, body.password))) {
    throw createError({ statusCode: 401, statusMessage: 'Incorrect password' })
  }

  authorizeScanAlbum(event, lib)
  return { authorized: true }
})