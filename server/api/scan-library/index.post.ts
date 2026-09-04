import {
  createScanLibrary,
  scanLibraryInputSchema,
  scanMountName,
} from '~~/server/services/scan-library/manager'
import { libraryScanner } from '~~/server/services/library/scanner'

export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readValidatedBody(event, scanLibraryInputSchema.parse)
  const id = await createScanLibrary(body)

  // 创建后立即扫描一次，生成缩略图/入库
  const result = await libraryScanner.scanMountByName(scanMountName(id))

  return {
    id,
    scanResult: result,
  }
})