import { z } from 'zod'
import { generateAlbumUid } from '~~/server/utils/albumUid'

/**
 * 手动重置相簿公开 UID（仅普通相簿）。
 * 当公开链接可能已泄露/被枚举时需要换新：生成一个新的不透明 UID 并落库，
 * 旧的公开链接随即失效。UID 只在管理员显式触发时才会改变，绝不自动变化。
 */
export default eventHandler(async (event) => {
  await requireUserSession(event)

  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({
      albumId: z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10)),
    }).parse,
  )

  const db = useDB()

  const album = await db
    .select()
    .from(tables.albums)
    .where(eq(tables.albums.id, albumId))
    .get()

  if (!album) {
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  }

  // 在唯一索引兜底下生成一个不冲突的新 UID
  let uid = ''
  do {
    uid = generateAlbumUid()
    const exists = db
      .select({ id: tables.albums.id })
      .from(tables.albums)
      .where(eq(tables.albums.uid, uid))
      .get()
    if (!exists) break
  } while (true)

  const updatedAlbum = db.transaction((tx) =>
    tx
      .update(tables.albums)
      .set({ uid, updatedAt: new Date() })
      .where(eq(tables.albums.id, albumId))
      .returning()
      .get(),
  )

  if (!updatedAlbum) {
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  }

  const { passwordHash: _ph, password: _pwd, ...safeAlbum } = updatedAlbum
  return { ...safeAlbum, uid }
})