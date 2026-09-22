import { z } from 'zod'
import { getStorageManager } from '~~/server/plugins/3.storage'
import { getMusicById } from '~~/server/services/music'
import { logger } from '~~/server/utils/logger'

/**
 * 流式返回一首 BGM 的音频内容（公开访问，无需登录，供前台相簿 BGM 播放）。
 * 支持 Range 请求以便音频 seek。内容从存储后端读取。
 */
export default eventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    z.object({ id: z.string().transform((v) => parseInt(v, 10)) }).parse,
  )

  const musicRow = await getMusicById(id)
  if (!musicRow) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const manager = getStorageManager()
  const provider = manager.getProvider()
  let buffer: Buffer | null
  try {
    buffer = await provider.get(musicRow.storageKey)
  } catch (error) {
    logger.chrono.error('Music stream: storage get failed', error)
    buffer = null
  }
  if (!buffer || buffer.byteLength === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const total = buffer.byteLength
  const contentType = musicRow.mimeType || 'audio/mpeg'

  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Accept-Ranges', 'bytes')
  // 时间长可永久缓存，BGM 文件基本只增不改
  setHeader(event, 'Cache-Control', 'public, max-age=31536000')

  // Range 支持（音频 seek）
  const range = getHeader(event, 'range')
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0
      const end = m[2] ? parseInt(m[2], 10) : total - 1
      if (!Number.isNaN(start) && start <= end && end < total) {
        setHeader(event, 'Content-Range', `bytes ${start}-${end}/${total}`)
        setHeader(event, 'Content-Length', String(end - start + 1))
        event.node.res.statusCode = 206
        return buffer.subarray(start, end + 1)
      }
    }
  }

  setHeader(event, 'Content-Length', String(total))
  return buffer
})