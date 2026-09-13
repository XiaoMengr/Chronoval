import { settingsManager } from '../services/settings/settingsManager'
import { cleanupExpiredTrashPhotos } from '../services/trash/cleanup'

let timer: NodeJS.Timeout | null = null
let stopped = false

const log = logger.dynamic('trash-cleanup')

// 默认每天清理一次；也可通过环境变量自定义（毫秒）
const INTERVAL_MS = Number(process.env.TRASH_CLEANUP_INTERVAL_MS || 24 * 60 * 60 * 1000)

/**
 * 读取回收站保留设置：app.trash.retention。
 * 返回保留天数；'never' 或缺失时返回 null（表示永不自动删除）。
 */
async function resolveRetentionDays(): Promise<number | null> {
  try {
    const raw = await settingsManager.get<string | null>(
      'app',
      'trash.retention' as any,
      '30',
    )
    if (!raw || raw === 'never') return null
    const days = Number(raw)
    return Number.isFinite(days) && days > 0 ? days : null
  } catch (err) {
    log.warn('Failed to read trash retention setting:', err)
    return null
  }
}

async function tick() {
  if (stopped) return
  try {
    const retention = await resolveRetentionDays()
    await cleanupExpiredTrashPhotos(retention)
  } catch (err) {
    log.error('Periodic trash cleanup failed:', err)
  }
}

function exitHandler() {
  stopped = true
  if (timer) clearTimeout(timer)
}

export default defineNitroPlugin(async (_nitroApp) => {
  // 首次清理延迟到存储管理器与设置就绪（启动插件顺序在 settings/storage 之后）
  const initialDelay = Number(process.env.TRASH_CLEANUP_INITIAL_DELAY_MS || 60 * 1000)

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

  log.info(`Trash cleanup scheduled every ${INTERVAL_MS}ms`)
})