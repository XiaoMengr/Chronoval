import { cleanupExpiredDisabledScanLibraries } from '../services/scan-library/manager'

let timer: NodeJS.Timeout | null = null
let stopped = false

const log = logger.dynamic('scan-cleanup')

// 默认每 24 小时清理一次；可通过环境变量自定义（毫秒）
const INTERVAL_MS = Number(
  process.env.SCAN_CLEANUP_INTERVAL_MS || 24 * 60 * 60 * 1000,
)
// 恢复缓冲期（天）：外部库被禁用后，超过该天数仍未重新启用则自动清理其缩略图文件与记录
const GRACE_DAYS = Number(process.env.SCAN_CLEANUP_GRACE_DAYS || 7)

async function tick() {
  if (stopped) return
  try {
    const purged = await cleanupExpiredDisabledScanLibraries(GRACE_DAYS)
    if (purged > 0) {
      log.info(`Cleaned up ${purged} disabled scan library(ies) not recovered within ${GRACE_DAYS} day(s)`)
    }
  } catch (err) {
    log.error('Periodic scan-library cleanup failed:', err)
  }
}

function exitHandler() {
  stopped = true
  if (timer) clearTimeout(timer)
}

export default defineNitroPlugin(async (_nitroApp) => {
  // 首次清理延迟到存储管理器与数据库就绪
  const initialDelay = Number(process.env.SCAN_CLEANUP_INITIAL_DELAY_MS || 60 * 1000)

  const schedule = () => {
    if (stopped) return
    timer = setTimeout(async () => {
      await tick()
      schedule()
    }, INTERVAL_MS)
  }

  setTimeout(async () => {
    await tick()
    schedule()
  }, initialDelay)

  process.on('SIGINT', exitHandler)
  process.on('SIGTERM', exitHandler)

  log.info(`Scan-library cleanup scheduled every ${INTERVAL_MS}ms (grace ${GRACE_DAYS}d)`)
})