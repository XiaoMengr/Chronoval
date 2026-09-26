import { z } from 'zod'
import path from 'node:path'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'
import { useDB, tables, eq } from '~~/server/utils/db'
import { serializeMusic } from '~~/server/services/music'
import { logger } from '~~/server/utils/logger'

/**
 * 为音乐盒中的一首 BGM 上传/更换自定义封面。
 * 仅管理员可访问。multipart/form-data：字段 cover（图片文件）。
 * 成功后将旧封面从存储后端清理掉。
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

  const form = await readMultipartFormData(event)
  if (!form) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid upload' })
  }

  const coverPart = form.find((f) => f.name === 'cover')
  if (!coverPart || !coverPart.data || coverPart.data.byteLength === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cover image' })
  }

  const mime = coverPart.type || 'image/png'
  if (!mime.startsWith('image/')) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Only image files are supported',
    })
  }

  const db = useDB()
  const existed = await db
    .select()
    .from(tables.music)
    .where(eq(tables.music.id, id))
    .get()
  if (!existed) {
    throw createError({ statusCode: 404, statusMessage: 'Music not found' })
  }

  const buffer = Buffer.from(coverPart.data)
  const { storageProvider } = useStorageProvider(event)

  // 写入新封面
  const coverExt = path.extname(coverPart.filename || '').toLowerCase() || '.png'
  const coverStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const coverKey = `music/covers/${coverStamp}${coverExt}`

  try {
    await storageProvider.create(coverKey, buffer, mime)
  } catch (error) {
    logger.chrono.error('Music cover upload: storage create failed', error)
    throw createError({ statusCode: 500, statusMessage: 'Cover upload failed' })
  }
  const coverUrl = storageProvider.getPublicUrl(coverKey)

  // 清理旧封面（失败不阻塞）
  if (existed.coverKey) {
    try {
      await storageProvider.delete(existed.coverKey)
    } catch (error) {
      logger.chrono.warn('Music cover upload: old cover cleanup failed', error)
    }
  }

  const row = await db
    .update(tables.music)
    .set({ coverKey, coverUrl, updatedAt: new Date() })
    .where(eq(tables.music.id, id))
    .returning()
    .get()

  return serializeMusic(row)
})
