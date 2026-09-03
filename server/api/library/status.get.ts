import { sql } from 'drizzle-orm'
import { getLibraryConfig } from '~~/server/services/library/config'

export default eventHandler(async (event) => {
  await requireUserSession(event)
  const cfg = getLibraryConfig()
  const db = useDB()

  const libraryCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tables.photos)
    .where(sql`source = 'library'`)
    .get()

  return {
    enabled: cfg.enabled,
    photosPath: cfg.photosPath,
    videosPath: cfg.videosPath,
    thumbnailDir: cfg.thumbnailDir,
    total: libraryCount?.count || 0,
    scanIntervalMs: Number(process.env.LIBRARY_SCAN_INTERVAL_MS || 300000),
  }
})