import path from 'node:path'
import { promises as fs, createReadStream } from 'node:fs'
import { getLibraryMounts } from '~~/server/services/scan-library/manager'
import {
  isRawExtension,
  extractEmbeddedJpegPreview,
} from '~~/server/services/image/raw'

const guessContentType = (filePath: string): string => {
  const ext = (filePath.split('.').pop() || '').toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'tif':
    case 'tiff':
      return 'image/tiff'
    case 'avif':
      return 'image/avif'
    case 'heic':
    case 'heif':
      return 'image/heic'
    case 'mp4':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'm4v':
      return 'video/x-m4v'
    case 'mkv':
      return 'video/x-matroska'
    case 'webm':
      return 'video/webm'
    case 'avi':
      return 'video/x-msvideo'
    case 'mts':
    case 'm2ts':
      return 'video/mp2t'
    default:
      return 'application/octet-stream'
  }
}

export default eventHandler(async (event) => {
  const p = getRouterParam(event, 'path') || ''
  const raw = (Array.isArray(p) ? p.join('/') : p) || ''
  // path 形如 <mountName>/<relPath>
  const slash = raw.indexOf('/')
  const mountName = slash === -1 ? raw : raw.slice(0, slash)
  const relRaw = slash === -1 ? '' : raw.slice(slash + 1)

  const mount = getLibraryMounts().find((m) => m.name === mountName)
  if (!mount) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const decodedRel = decodeURIComponent(relRaw)
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')

  if (decodedRel.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  const absolute = path.resolve(mount.root, decodedRel)
  if (!absolute.startsWith(path.resolve(mount.root) + path.sep)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  let stat
  try {
    stat = await fs.stat(absolute)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  if (!stat.isFile()) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const etag = `W/"${stat.size}-${stat.mtimeMs}"`
  setHeader(event, 'ETag', etag)
  setHeader(event, 'Last-Modified', stat.mtime.toUTCString())
  // 原文件只读映射，可长缓存
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'Content-Type', guessContentType(absolute))
  setHeader(event, 'Accept-Ranges', 'bytes')

  // 条件请求
  const inm = getHeader(event, 'if-none-match')
  const ims = getHeader(event, 'if-modified-since')
  if (
    inm === etag ||
    (ims && new Date(ims).getTime() >= stat.mtime.getTime())
  ) {
    event.node.res.statusCode = 304
    return null
  }

  // 相机 RAW：默认返回内嵌 JPEG 预览供查看器/网格渲染（浏览器与 WebGL 无法直接解码 RAW）；
  // 显式 ?original=1 时返回原始 RAW 字节（无损归档/下载）。缩略图走独立 thumb 路由不受影响。
  const fileExt = path.extname(absolute).toLowerCase()
  const wantOriginal = getQuery(event).original === '1'
  if (isRawExtension(fileExt) && !wantOriginal) {
    try {
      const rawBuffer = await fs.readFile(absolute)
      const preview = extractEmbeddedJpegPreview(rawBuffer)
      if (preview) {
        setHeader(event, 'Content-Type', 'image/jpeg')
        setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
        event.node.res.setHeader('Content-Length', String(preview.length))
        return preview
      }
    } catch {
      // 预览失败时回落到原始字节流，保证接口始终可用
    }
  }

  // Range 支持（视频拖动进度）
  const range = getHeader(event, 'range')
  if (range) {
    const matches = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (matches) {
      const start = matches[1] ? parseInt(matches[1], 10) : 0
      const endVal = matches[2] ? parseInt(matches[2], 10) : stat.size - 1
      if (start <= endVal && endVal < stat.size && start < stat.size) {
        event.node.res.statusCode = 206
        setHeader(
          event,
          'Content-Range',
          `bytes ${start}-${endVal}/${stat.size}`,
        )
        event.node.res.setHeader('Content-Length', String(endVal - start + 1))
        const stream = createReadStream(absolute, { start, end: endVal })
        return sendStream(event, stream)
      }
    }
  }

  // 明确告知响应长度：缺少 Content-Length 时，浏览器 XHR 的 onprogress 拿不到
  // lengthComputable，前端无法计算并展示真实下载百分比（始终停在 0%）。
  event.node.res.setHeader('Content-Length', String(stat.size))
  return sendStream(event, createReadStream(absolute))
})