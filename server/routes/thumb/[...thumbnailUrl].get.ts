import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

export default eventHandler(async (event) => {
  const { storageProvider } = useStorageProvider(event)

  let url = getRouterParam(event, 'thumbnailUrl')

  if (!url) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid thumbnailUrl',
    })
  }

  url = decodeURIComponent(url)

  // 缩略图内容由路径唯一决定、可随时重算，浏览器可安全长期缓存（大幅减少重复回源码）
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  // 扫描库缩略图（就地写在挂载目录的 thumbnails/ 下）：直接从磁盘读取，
  // 避免走下方的 `fetch(url)`——相对 URL 在服务端 fetch 会抛错导致 OG 生成黑屏。
  if (url.startsWith('/library/')) {
    const { getLibraryMounts } = await import(
      '~~/server/services/scan-library/manager'
    )
    const rest = url.replace(/^\/library\//, '')
    const slash = rest.indexOf('/')
    const mountName = slash === -1 ? rest : rest.slice(0, slash)
    const relRaw = slash === -1 ? '' : rest.slice(slash + 1)

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

    let thumb: Buffer
    try {
      thumb = await fs.readFile(absolute)
    } catch {
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    }
    return await sharp(thumb).rotate().jpeg({ quality: 85 }).toBuffer()
  }

  // 本地存储：直接从磁盘读取缩略图文件，避免服务器回连自身公网域名
  // （此前用 `fetch(\`${host}${url}\`)` 在沙箱内无法访问 dev.1xc.top 这类
  //   公网域名，导致 OG 生成黑屏 / 缩略图 500）
  if (
    storageProvider.config?.provider === 'local' &&
    url.startsWith('/storage/')
  ) {
    const basePath = (storageProvider.config as any).basePath as string
    const relRaw = url.replace(/^\/storage\//, '')
    const relPath = decodeURIComponent(relRaw)
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\/+/, '')

    if (relPath.includes('..')) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
    }

    const absolute = path.resolve(basePath, relPath)
    if (!absolute.startsWith(path.resolve(basePath) + path.sep)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
    }

    let photo: Buffer
    try {
      photo = await fs.readFile(absolute)
    } catch {
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    }

    return await sharp(photo).rotate().jpeg({ quality: 85 }).toBuffer()
  }

  const photo = await fetch(url)
    .then((res) => {
      if (!res.ok) {
        throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
      }
      return res.arrayBuffer()
    })
    .then((buf) => Buffer.from(buf))

  const sharpInst = sharp(photo).rotate()
  return await sharpInst.jpeg({ quality: 85 }).toBuffer()
})