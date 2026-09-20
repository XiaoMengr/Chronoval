import * as si from 'systeminformation'
import { eq } from 'drizzle-orm'
import { useDB } from '~~/server/utils/db'
import { scanLibraries } from '~~/server/database/schema'
import { settingsManager } from '../../services/settings/settingsManager'

// 模块级缓存（Nitro 单实例进程内共享）
let __uploadTargetCache: {
  at: number
  data: {
    targets: {
      key: string
      availableBytes: number | null
      totalBytes: number | null
    }[]
  }
} | null = null

/**
 * 上传位置可用空间
 *
 * 供「上传照片」弹层展示各上传目标（内部默认存储 + 外部扫描库）当前剩余可用的磁盘空间。
 * 仅对可本地统计磁盘的目标返回数值；网络存储（如 S3）无本地磁盘概念，返回 null 由前端隐藏。
 */
export default defineEventHandler(async () => {
  // 短 TTL 缓存：磁盘用量变化频率远低于请求频率
  const TTL_MS = 10_000
  const now = Date.now()

  if (__uploadTargetCache && now - __uploadTargetCache.at < TTL_MS) {
    return __uploadTargetCache.data
  }

  // 解析某一路径所在挂载点的可用/总量字节（挂载路径最长前缀优先）
  const resolveSpace = async (
    path: string,
  ): Promise<{ available: number | null; total: number | null } | null> => {
    let disks: Awaited<ReturnType<typeof si.fsSize>> | null = null
    try {
      disks = await si.fsSize()
    } catch (error) {
      console.warn('Failed to read filesystems:', error)
      return null
    }
    const isRealFs = (d: { type?: string; size?: number }) =>
      d.type !== 'tmpfs' &&
      d.type !== 'overlay' &&
      d.type !== 'squashfs' &&
      (d.size || 0) > 0

    const matches = disks
      .filter(
        (d) => isRealFs(d) && (path.startsWith(d.mount) || d.mount.startsWith(path)),
      )
      .sort((a, b) => b.mount.length - a.mount.length)
    let root = matches[0]
    root = root || disks.find((d) => d.mount === '/')
    if (!root || !root.size) return null

    const total = root.size || 0
    const available =
      typeof root.available === 'number' && root.available >= 0
        ? root.available
        : total - (root.used || 0)
    return { available, total }
  }

  type Target = {
    key: string
    /** 可用字节数；无法统计（网络存储等）时为 null */
    availableBytes: number | null
    /** 总容量字节数；无法统计时为 null */
    totalBytes: number | null
  }
  const targets: Target[] = []

  // 1) 内部默认存储：仅当 provider 为 local 时有本机磁盘可统计
  try {
    const active = await settingsManager.storage.getActiveProvider()
    const cfg = active
      ? typeof active.config === 'string'
        ? JSON.parse(active.config)
        : active.config || {}
      : {}
    const provider = active?.provider || cfg?.provider || null
    if (provider === 'local' && cfg?.basePath) {
      const space = await resolveSpace(String(cfg.basePath))
      targets.push({
        key: 'storage',
        availableBytes: space?.available ?? null,
        totalBytes: space?.total ?? null,
      })
    }
  } catch (error) {
    console.warn('Failed to resolve default storage free space:', error)
  }

  // 2) 已启用的外部扫描库
  try {
    const libs = useDB()
      .select({ id: scanLibraries.id, rootPath: scanLibraries.rootPath })
      .from(scanLibraries)
      .where(eq(scanLibraries.enabled, true))
      .all()
    for (const lib of libs) {
      if (!lib.rootPath) continue
      const space = await resolveSpace(lib.rootPath)
      targets.push({
        key: String(lib.id),
        availableBytes: space?.available ?? null,
        totalBytes: space?.total ?? null,
      })
    }
  } catch (error) {
    console.warn('Failed to resolve scan library free space:', error)
  }

  __uploadTargetCache = { at: now, data: { targets } }
  return { targets }
})