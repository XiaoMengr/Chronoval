import path from 'node:path'
import { promises as fs } from 'node:fs'
import { getScanLibraryRow } from '~~/server/services/scan-library/manager'

// 上传到外部扫描库：客户端把文件 body PUT 到这里，
// 服务端将其写入所选扫描库的挂载目录（rootPath/uploads/），
// 后续由该库的扫描任务将其索引入库。
export default eventHandler(async (event) => {
  await requireUserSession(event)

  const { library, key } = getQuery(event)
  const libId = Number(library)
  const lib = getScanLibraryRow(libId)
  if (!lib || !lib.enabled) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid library' })
  }

  if (typeof key !== 'string' || !key) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid key' })
  }

  const rel = decodeURIComponent(key)
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
  if (rel.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  const root = path.resolve(lib.rootPath)
  const abs = path.resolve(root, rel)
  if (!abs.startsWith(root + path.sep)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  const buf = await readRawBody(event).catch(() => null)
  if (!buf || buf.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }

  await fs.mkdir(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.tmp-${Date.now()}`
  await fs.writeFile(tmp, buf)
  await fs.rename(tmp, abs)

  return { ok: true, key: rel, library: lib.id }
})