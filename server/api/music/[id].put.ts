import { z } from 'zod'
import { useDB, tables, eq } from '~~/server/utils/db'
import { serializeMusic } from '~~/server/services/music'

/**
 * 更新一首 BGM 的标题与歌词（LRC）。仅管理员可访问。
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

  const body = await readValidatedBody(
    event,
    z.object({
      title: z.string().trim().min(1).max(255).optional(),
      lyrics: z.string().max(50000).nullable().optional(),
    }).parse,
  )

  const db = useDB()
  const existed = await db
    .select()
    .from(tables.music)
    .where(eq(tables.music.id, id))
    .get()
  if (!existed) {
    throw createError({ statusCode: 404, statusMessage: 'Music not found' })
  }

  const update: Partial<typeof existed> = {
    updatedAt: new Date(),
  }
  if (typeof body.title === 'string') update.title = body.title
  if (typeof body.lyrics !== 'undefined') {
    update.lyrics = body.lyrics && body.lyrics.trim() ? body.lyrics.trim() : null
  }

  const row = await db
    .update(tables.music)
    .set(update)
    .where(eq(tables.music.id, id))
    .returning()
    .get()

  return serializeMusic(row)
})