import { libraryScanner } from '~~/server/services/library/scanner'
import { getAllScalableMounts } from '~~/server/services/scan-library/manager'

export default eventHandler(async (event) => {
  await requireUserSession(event)
  const mount = getQuery(event).mount as string | undefined

  if (mount) {
    // 用 getAllScalableMounts() 查找：即使某库目录曾被判定不可用而被画廊隐藏，
    // 用户恢复目录后仍能在此手动触发「立即扫描」使其自动回归画廊
    const found = getAllScalableMounts().find((m) => m.name === mount)
    if (!found) {
      throw createError({
        statusCode: 400,
        statusMessage: `Unknown mount: ${mount}`,
      })
    }
    return await libraryScanner.scanMountByName(mount)
  }

  return await libraryScanner.scanAll()
})