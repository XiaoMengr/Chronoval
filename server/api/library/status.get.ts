import { sql } from 'drizzle-orm'
import { getLibraryConfig } from '~~/server/services/library/config'
import {
  getLibraryMounts,
  listScanLibraries,
} from '~~/server/services/scan-library/manager'

export default eventHandler(async (event) => {
  await requireUserSession(event)
  const cfg = getLibraryConfig()
  const db = useDB()

  const libraryCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tables.photos)
    .where(sql`source = 'library'`)
    .get()

  const libraries = await listScanLibraries()
  const mounts = getLibraryMounts()

  return {
    enabled: cfg.enabled,
    photosPath: cfg.photosPath,
    videosPath: cfg.videosPath,
    thumbnailDir: cfg.thumbnailDir,
    total: libraryCount?.count || 0,
    scanIntervalMs: Number(process.env.LIBRARY_SCAN_INTERVAL_MS || 300000),
    // 扫描库存储方式的独立信息
    libraries,
    mounts: mounts.map((m) => ({
      name: m.name,
      root: m.root,
      routePrefix: m.routePrefix,
    })),
  }
})