import { z } from 'zod'
import { scanMountName } from '~~/server/services/scan-library/manager'
import {
  getScanAlbumMeta,
  upsertScanAlbumMeta,
} from '~~/server/services/scan-library/album-meta'
import { and, eq } from 'drizzle-orm'
import { useDB, tables } from '~~/server/utils/db'

/**
 * 手动重置外部库（扫描库）相簿的公开 URL 标识。
 * 为该相簿生成一个新的随机 urlKey（存于 scan_album_meta.url_key），
 * 使旧的公开地址失效。与库级 urlKey 无关、不会被 backfill 还原。
 * 仅管理员可访问。
 */
export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readValidatedBody(
    event,
    z.object({
      libId: z.number().int().positive(),
      path: z.string().default(''),
    }).parse,
  )

  const mount = scanMountName(body.libId)
  const db = useDB()

  const existing = await getScanAlbumMeta(mount, body.path)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Album meta not found' })
  }

  // 在唯一索引兜底下生成一个不冲突的新 urlKey（8 位字母数字）
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let urlKey = ''
  do {
    urlKey = Array.from(
      { length: 8 },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join('')
    const dupOnMeta = db
      .select({ id: tables.scanAlbumMeta.id })
      .from(tables.scanAlbumMeta)
      .where(and(eq(tables.scanAlbumMeta.urlKey, urlKey)))
      .get()
    const dupOnLib = db
      .select({ id: tables.scanLibraries.id })
      .from(tables.scanLibraries)
      .where(and(eq(tables.scanLibraries.urlKey, urlKey)))
      .get()
    if (!dupOnMeta && !dupOnLib) break
  } while (true)

  const meta = await upsertScanAlbumMeta({
    mount,
    relPath: body.path,
    urlKey,
  })

  return { success: true, urlKey: meta.urlKey }
})