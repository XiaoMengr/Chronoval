import { z } from 'zod'
import { scanMountName } from '~~/server/services/scan-library/manager'
import { libraryScanner } from '~~/server/services/library/scanner'

export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const { id } = await getValidatedRouterParams(
    event,
    z.object({ id: z.string().transform((v) => parseInt(v, 10)) }).parse,
  )

  const result = await libraryScanner.scanMountByName(scanMountName(id))
  return { scanResult: result }
})