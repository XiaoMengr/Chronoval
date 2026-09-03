import { libraryScanner, getLibraryConfig } from '../services/library'

let scanTimer: NodeJS.Timeout | null = null

export default defineNitroPlugin(async (_nitroApp) => {
  const cfg = getLibraryConfig()
  const log = logger.dynamic('library')

  if (!cfg.enabled) {
    log.info('Library scanner disabled via LIBRARY_ENABLED=false')
    return
  }

  // 等待存储管理器就绪后再扫描（缩略图写入本地存储）
  const waitForStorage = async (): Promise<boolean> => {
    const { getGlobalStorageManager } = await import(
      '../services/storage/events'
    )
    for (let i = 0; i < 100; i++) {
      if (getGlobalStorageManager()) return true
      await new Promise((r) => setTimeout(r, 100))
    }
    return false
  }

  const initialDelay = Number(process.env.LIBRARY_SCAN_DELAY_MS || 5000)

  // 首次扫描（延迟等待存储就绪）
  setTimeout(async () => {
    const ready = await waitForStorage()
    if (!ready) {
      log.warn('Storage manager not ready, skip initial library scan')
      return
    }
    log.info('Running initial library scan...')
    const r = await libraryScanner.scanAll()
    for (const [name, res] of Object.entries(r)) {
      log.info(
        `[${name}] indexed=${res.indexed} updated=${res.updated} failed=${res.failed}`,
      )
    }
  }, initialDelay)

  // 周期重扫，捕获新放入目录的文件（方式简单可靠，无需 inotify）
  const interval = Number(process.env.LIBRARY_SCAN_INTERVAL_MS || 300000)
  if (interval > 0) {
    scanTimer = setInterval(async () => {
      try {
        await libraryScanner.scanAll()
      } catch (err) {
        log.error('Periodic library scan failed:', err)
      }
    }, interval)
  }

  const exitHandler = () => {
    if (scanTimer) clearInterval(scanTimer)
  }
  process.on('SIGINT', exitHandler)
  process.on('SIGTERM', exitHandler)
})