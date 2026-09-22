import { z } from 'zod'
import { useDB, tables, eq } from '~~/server/utils/db'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'
import { logger } from '~~/server/utils/logger'

/**
 * 删除音乐盒中的一首 BGM：同时清理存储后端文件，并解除相簿/扫描库相簿对该音乐的引用。
 * 仅管理员可访问。
 */
export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const { id } = await getValidatedRouterParams(
    event,
    z.object({ id: z.string().transform((v) => parseInt(v, 10)) }).parse,
  )

  const db = useDB()
  const musicRow = await db
    .select()
    .from(tables.music)
    .where(eq(tables.music.id, id))
    .get()

  if (!musicRow) {
    throw createError({ statusCode: 404, statusMessage: 'Music not found' })
  }

  // 解除引用：相簿与扫描库相簿元数据的 bgmMusicId 置空
  db.update(tables.albums)
    .set({ bgmMusicId: null })
    .where(eq(tables.albums.bgmMusicId, id))
    .run()
  db.update(tables.scanAlbumMeta)
    .set({ bgmMusicId: null })
    .where(eq(tables.scanAlbumMeta.bgmMusicId, id))
    .run()

  // 删除存储后端文件（失败不阻塞数据库删除）
  try {
    const { storageProvider } = useStorageProvider(event)
    await storageProvider.delete(musicRow.storageKey)
  } catch (error) {
    logger.chrono.warn('Music delete: storage cleanup failed', error)
  }

  await db.delete(tables.music).where(eq(tables.music.id, id)).run()

  return { success: true }
})