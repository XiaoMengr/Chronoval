import { z } from 'zod'
import {
  updateScanLibrary,
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

  const { id } = await getValidatedRouterParams(
    event,
    z.object({ id: z.string().transform((v) => parseInt(v, 10)) }).parse,
  )

  // 更新支持局部字段（如启停开关只传 { enabled }），无需 rootPath；
  // 新建（index.post.ts）仍然要求 rootPath 必填。
  const body = await readValidatedBody(
    event,
    scanLibraryInputSchema.partial().parse,
  )
  await updateScanLibrary(id, body)

  // 更新后在后台触发一次重新扫描（不阻塞保存响应）。
  // 大库（数万张照片）全量扫描可能耗时数分钟，编辑展示方式/启停等配置
  // 无需等待扫描完成；扫描进度经扫描状态球与「最近扫描结果」回显。
  void libraryScanner
    .scanMountByName(scanMountName(id))
    .then((result) => {
      if (result && !result.skipped) {
        logger.chrono.info(
          `Scan library ${id} rescan done: indexed=${result.indexed} updated=${result.updated} failed=${result.failed}`,
        )
      }
    })
    .catch((error) => {
      logger.chrono.error(`Scan library ${id} background rescan failed:`, error)
    })

  return { success: true, scanQueued: true }
})