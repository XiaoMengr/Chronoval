/**
 * 全景照片检测。
 *
 * 原理：
 *  - 等距柱状投影（equirectangular）全景：宽高比接近 2:1（width ≈ 2 * height）。
 *    该投影下整张全景可直接作为球体内壁纹理渲染，形成 360° 环视。
 *  - 大疆 360° 全景（DJI Sphere/Pano）：EXIF XMP-GPano 会写入 ProjectionType
 *    = "equirectangular" 等字段；即便裁剪后比例偏离 2:1，凭元数据仍判定为全景。
 *
 * 返回类型：
 *  - 'equirect' 等距柱状投影（含大疆 360°，二者均用同一球面渲染器，仅来源标志不同）
 *  - null       普通照片
 */

export interface PanoramaProbe {
  width?: number | null
  height?: number | null
  aspectRatio?: number | null
  exif?: {
    ProjectionType?: string
    FullPanoWidthPixels?: number
    FullPanoHeightPixels?: number
    [key: string]: unknown
  } | null
}

export type PanoramaType = 'equirect'

export const EQUIRECT_MIN_RATIO = 1.7
export const EQUIRECT_MAX_RATIO = 2.35

/** 是否为等距柱状/球面全景 */
export function detectPanoramaType(p: PanoramaProbe): PanoramaType | null {
  if (!p) return null

  // 1) 元数据优先：XMP-GPano 明确标注等距柱状投影
  const exif = p.exif
  if (exif?.ProjectionType) {
    const proj = String(exif.ProjectionType).trim().toLowerCase()
    if (
      proj === 'equirectangular' ||
      proj.includes('equirect') ||
      proj.includes('spherical')
    ) {
      return 'equirect'
    }
  }
  if (exif?.FullPanoWidthPixels && exif?.FullPanoHeightPixels) {
    return 'equirect'
  }

  // 2) 几何兜底：宽高比接近 2:1
  const w = p.width ?? 0
  const h = p.height ?? 0
  if (w > 0 && h > 0) {
    const ratio = w / h
    if (ratio >= EQUIRECT_MIN_RATIO && ratio <= EQUIRECT_MAX_RATIO) {
      return 'equirect'
    }
  }
  // aspectRatio 直接给出的情形
  const ar = p.aspectRatio ?? 0
  if (ar > 0) {
    if (ar >= EQUIRECT_MIN_RATIO && ar <= EQUIRECT_MAX_RATIO) {
      return 'equirect'
    }
  }

  return null
}

export function isPanorama(p: PanoramaProbe): boolean {
  return detectPanoramaType(p) === 'equirect'
}