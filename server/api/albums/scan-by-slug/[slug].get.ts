import { getScanAlbumMetaBySlug } from '~~/server/services/scan-library/album-meta'

/**
 * 通过自定义URL别名解析扫描库相簿，返回其真实挂载名与相对路径，
 * 供前台 /albums/s/{slug} 页面重定向到规范相簿地址。
 */
export default eventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Slug is required' })
  }

  const meta = await getScanAlbumMetaBySlug(slug)
  if (!meta) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const libId = Number(meta.mount.replace(/^scan_/, ''))
  if (!Number.isFinite(libId)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  return {
    libId,
    mount: meta.mount,
    relPath: meta.relPath,
  }
})