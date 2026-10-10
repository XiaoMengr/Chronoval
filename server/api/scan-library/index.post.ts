import {
  createScanLibrary,
  scanLibraryInputSchema,
  scanMountName,
} from '~~/server/services/scan-library/manager'
import { libraryScanner } from '~~/server/services/library/scanner'
import { logger } from '~~/server/utils/logger'

export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readValidatedBody(event, scanLibraryInputSchema.parse)
  const id = await createScanLibrary(body)

  // 创建后在后台执行首次扫描（生成缩略图/入库），不阻塞保存响应。
  // 大库首次索引可能耗时很久；进度经扫描状态球与「最近扫描结果」回显。
  void libraryScanner
    .scanMountByName(scanMountName(id))
    .catch((error) => {
      logger.chrono.error(`Scan library ${id} initial scan failed:`, error)
    })

  return {
    id,
    scanQueued: true,
  }
})