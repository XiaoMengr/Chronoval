import { z } from 'zod'
import {
  updateScanLibrary,
  scanLibraryInputSchema,
  scanMountName,
} from '~~/server/services/scan-library/manager'
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

  // 更新支持局部字段（如启停开关只传 { enabled }），无需 rootPath；
  // 新建（index.post.ts）仍然要求 rootPath 必填。
  const body = await readValidatedBody(
    event,
    scanLibraryInputSchema.partial().parse,
  )
  await updateScanLibrary(id, body)

  // 更新后立即扫描一次
  const result = await libraryScanner.scanMountByName(scanMountName(id))

  return { success: true, scanResult: result }
})