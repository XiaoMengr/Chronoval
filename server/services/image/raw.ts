import path from 'node:path'

/**
 * 相机 RAW 格式支持。
 *
 * 背景：sharp/libvips 预编译未集成 libraw，无法对相机 RAW（CR2/CR3/NEF/ARW/…）
 * 做完整线性还原；浏览器与 WebGL 解码器也无法直接渲染 RAW。为此采用业界通用手法：
 * 提取 RAW 容器内嵌的 JPEG 预览（绝大多数厂商都会在 RAW 内嵌从缩略图到全尺寸的 JPEG 预览），
 * 用于生成缩略图、供查看器展示与下载，同时始终保留原始 RAW 文件供无损归档。
 */

export const RAW_EXTENSIONS = new Set([
  '.cr2',
  '.cr3',
  '.crw',
  '.nef',
  '.nrw',
  '.arw',
  '.srf',
  '.sr2',
  '.raf',
  '.orf',
  '.rw2',
  '.pef',
  '.dng',
  '.srw',
  '.x3f',
  '.dcr',
  '.kdc',
  '.iiq',
  '.3fr',
  '.erf',
  '.mrw',
  '.raw',
])

export const isRawExtension = (fileOrExt: string): boolean => {
  let ext = (fileOrExt || '').trim().toLowerCase()
  if (ext.includes(path.sep) || ext.includes('/') || ext.includes('.')) {
    ext = path.extname(ext)
  }
  return RAW_EXTENSIONS.has(ext)
}

const SOI = Buffer.from([0xff, 0xd8, 0xff]) // JPEG 起始标记
const EOI = Buffer.from([0xff, 0xd9]) // JPEG 结束标记

/**
 * 从 RAW 容器中提取最大的内嵌 JPEG 预览。
 * 用 Buffer.indexOf（原生）定位 SOI/EOI，遍历所有候选并取字节数最大者，
 * 以避开缩略图而命中全尺寸预览。JPEG 熵编码段对 0xFF 做了填充转义，故 0xFFD9 误判概率极低。
 * @returns 内嵌 JPEG 完整数据；未找到时返回 null
 */
export const extractEmbeddedJpegPreview = (buffer: Buffer): Buffer | null => {
  if (!buffer || buffer.length < 6) return null
  const n = buffer.length
  // 限制扫描范围，避免对超大文件（>300MB）全量线性扫描
  const limit = Math.min(n, 300 * 1024 * 1024)
  let bestStart = -1
  let bestLen = 0
  let cursor = 0

  while (cursor < limit - 2) {
    const start = buffer.indexOf(SOI, cursor)
    if (start === -1 || start > limit - 2) break
    const end = buffer.indexOf(EOI, start + 2)
    if (end === -1 || end > limit - 2) break
    const len = end + 2 - start
    if (len > bestLen) {
      bestLen = len
      bestStart = start
    }
    cursor = end + 2
  }

  if (bestStart === -1 || bestLen <= 0) return null
  return buffer.subarray(bestStart, bestStart + bestLen)
}

/**
 * 把 RAW 缓冲转成可展示的 JPEG（内嵌全尺寸预览）。
 * 无内嵌预览时返回 null（调用方可据此优雅降级）。
 */
export const rawToJpegPreview = (buffer: Buffer): Buffer | null =>
  extractEmbeddedJpegPreview(buffer)