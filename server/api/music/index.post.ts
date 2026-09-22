import { z } from 'zod'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'
import { useDB, tables } from '~~/server/utils/db'
import { probeAudioDuration } from '~~/server/services/library/ffmpeg'
import { serializeMusic } from '~~/server/services/music'
import { logger } from '~~/server/utils/logger'

/**
 * 上传一首 BGM 到音乐盒。
 * 仅管理员可访问。multipart/form-data：字段 file（音频文件）+ title（可选标题，默认取文件名）。
 */
export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const form = await readMultipartFormData(event)
  if (!form) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid upload' })
  }

  const filePart = form.find((f) => f.name === 'file')
  const titlePart = form.find((f) => f.name === 'title')
  const lyricsPart = form.find((f) => f.name === 'lyrics')

  if (!filePart || !filePart.data || filePart.data.byteLength === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Missing audio file' })
  }

  // 仅收音频类型的文件
  const mime = filePart.type || 'audio/mpeg'
  if (!mime.startsWith('audio/')) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Only audio files are supported',
    })
  }

  const filename = filePart.filename || 'bgm.mp3'
  const buffer = Buffer.from(filePart.data)

  const { storageProvider } = useStorageProvider(event)
  const db = useDB()

  // 1) 写入存储后端，key 形如 music/{timestamp}-{safe}/
  const ext = path.extname(filename).toLowerCase() || '.mp3'
  const safeName = (path.basename(filename, ext) || 'bgm')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .slice(0, 60)
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const storageKey = `music/${stamp}_${safeName}${ext}`

  try {
    await storageProvider.create(storageKey, buffer, mime)
  } catch (error) {
    logger.chrono.error('Music upload: storage create failed', error)
    throw createError({ statusCode: 500, statusMessage: 'Upload failed' })
  }

  // 2) 探测音频时长（写临时文件用 ffprobe 解析；失败则置 null 不阻塞上传）
  let duration: number | null = null
  let tmpPath: string | null = null
  try {
    tmpPath = path.join(tmpdir(), `cframe-bgm-${Date.now()}.tmp`)
    await fs.writeFile(tmpPath, buffer)
    duration = await probeAudioDuration(tmpPath)
  } catch {
    duration = null
  } finally {
    if (tmpPath) {
      await fs.unlink(tmpPath).catch(() => {})
    }
  }

  // 3) 落库
  const row = await db
    .insert(tables.music)
    .values({
      title: (titlePart ? Buffer.from(titlePart.data).toString('utf-8') : '').trim() || filename,
      filename,
      storageKey,
      mimeType: mime,
      duration,
      fileSize: buffer.byteLength,
      lyrics: lyricsPart
        ? Buffer.from(lyricsPart.data).toString('utf-8').trim() || null
        : null,
    })
    .returning()
    .get()

  return serializeMusic(row)
})