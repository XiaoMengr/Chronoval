import { libraryScanner } from '~~/server/services/library/scanner'
import { getLibraryMounts } from '~~/server/services/library/config'

export default eventHandler(async (event) => {
  await requireUserSession(event)
  const mount = getQuery(event).mount as string | undefined

  if (mount) {
    const found = getLibraryMounts().find((m) => m.name === mount)
    if (!found) {
      throw createError({
        statusCode: 400,
        statusMessage: `Unknown mount: ${mount}`,
      })
    }
    return await libraryScanner.scanMount(found)
  }

  return await libraryScanner.scanAll()
})