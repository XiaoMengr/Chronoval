import { listScanLibraries } from '~~/server/services/scan-library/manager'

export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  const libs = await listScanLibraries()
  return { libraries: libs }
})