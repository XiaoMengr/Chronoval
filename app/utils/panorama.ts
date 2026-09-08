/**
 * 全景照片检测。
 *
 * 严格规则（避免把 16:9 等普通横图误判为全景）：
 *  - 优先读取照片 EXIF 中的 XMP-GPano 元数据（大疆等 360 相机 / 拼接软件写入）：
 *      ProjectionType = equirectangular | spherical，或存在 FullPanoWidthPixels / FullPanoHeightPixels。
 *    DJI 球形全景 / 等距柱状全景都会写入这些字段，据此判定最可靠。
 *  - 几何兜底仅在宽高比严格接近 2:1（等距柱状投影的精确比例，±1%）时判定为全景。
 *    16:9（1.78）、3:2（1.5）等普通横照会被排除。
 *  - 手动标记覆盖自动判定：isPanorama=1 强制全景；isPanorama=0 强制非全景。
 */

import type { Photo } from '~~/server/utils/db'

export interface PanoramaProbe {
  width?: number | null
  height?: number | null
  aspectRatio?: number | null
  /** 手动标记：null=自动，1=强制全景，0=强制非全景 */
  isPanorama?: number | null
  /** 轻量探针：读取相机/拼接软件写入的 XMP-GPano 等元数据 */
  exif?: Record<string, unknown> | null
}

/** 等距柱状投影的宽高比就是精确 2:1，允许 ±1% 的微小误差 */
export const EQUIRECT_RATIO = 2
export const EQUIRECT_TOLERANCE = 0.011

/**
 * 依据元数据 + 严格几何判定是否为等距柱状/球面全景。
 * 不包含手动标记（由 isPanorama 统一处理）。
 */
function autoDetectEquirect(p: Photo | PanoramaProbe | null | undefined): boolean {
  if (!p) return false

  // 1) 元数据优先：XMP-GPano 明确标注等距柱状投影
  const exif = (p.exif ?? {}) as Record<string, unknown>
  if (exif?.ProjectionType) {
    const proj = String(exif.ProjectionType).trim().toLowerCase()
    if (
      proj === 'equirectangular' ||
      proj.includes('equirect') ||
      proj.includes('spherical')
    ) {
      return true
    }
  }
  if (exif?.FullPanoWidthPixels && exif?.FullPanoHeightPixels) {
    return true
  }

  // 2) 几何兜底：宽高比严格接近 2:1
  const ratio = p.width && p.height ? p.width / p.height : p.aspectRatio ?? 0
  if (ratio > 0) {
    const lower = EQUIRECT_RATIO * (1 - EQUIRECT_TOLERANCE)
    const upper = EQUIRECT_RATIO * (1 + EQUIRECT_TOLERANCE)
    if (ratio >= lower && ratio <= upper) {
      return true
    }
  }

  return false
}

/** 是否全景照片：手动标记优先，其次自动判定 */
export function isPanorama(p: Photo | PanoramaProbe | null | undefined): boolean {
  if (!p) return false
  if (p.isPanorama === 1) return true
  if (p.isPanorama === 0) return false
  return autoDetectEquirect(p)
}