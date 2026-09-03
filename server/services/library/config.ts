import path from 'node:path'

/**
 * 媒体库配置：本地映射目录（只读），可直接把照片/视频丢进目录即被自动识别
 *
 * 图片目录默认 /app/photos，视频目录默认 /app/videos。
 * 可通过环境变量覆盖：
 *   LIBRARY_PHOTOS_PATH
 *   LIBRARY_VIDEOS_PATH
 *   LIBRARY_THUMBNAIL_DIR   (缩略图落在可写数据目录中的相对子目录)
 */
export interface LibraryConfig {
  /** 图片目录绝对路径（映射，只读） */
  photosPath: string
  /** 视频目录绝对路径（映射，只读） */
  videosPath: string
  /** 缩略图写入的相对目录（位于本地存储 basePath 下） */
  thumbnailDir: string
  /** 是否启用自动扫描 */
  enabled: boolean
}

export interface LibraryMount {
  /** 挂载名：photos | videos */
  name: string
  /** 保存到数据库的 type 字段 */
  type: 'image' | 'video'
  /** 目录绝对路径（只读源） */
  root: string
  /** 支持的扩展名集合（小写、含点） */
  extensions: Set<string>
  /** 访问路由前缀 */
  routePrefix: string
}

const toAbs = (p: string, fallback: string): string => {
  const v = (p || '').trim()
  if (!v) return fallback
  // 只转成绝对路径，绝不附加额外参数；避免把挂载根解析成整个文件系统 / 
  return path.resolve(v)
}

export const DEFAULT_LIBRARY_PHOTOS = '/app/photos'
export const DEFAULT_LIBRARY_VIDEOS = '/app/videos'

export const getLibraryConfig = (): LibraryConfig => {
  const config = useRuntimeConfig() as any
  const runtime = config?.library || {}
  return {
    photosPath: toAbs(
      runtime.photosPath || process.env.LIBRARY_PHOTOS_PATH!,
      DEFAULT_LIBRARY_PHOTOS,
    ),
    videosPath: toAbs(
      runtime.videosPath || process.env.LIBRARY_VIDEOS_PATH!,
      DEFAULT_LIBRARY_VIDEOS,
    ),
    thumbnailDir: toAbs(
      runtime.thumbnailDir || process.env.LIBRARY_THUMBNAIL_DIR!,
      'library/thumbnails',
    ),
    enabled: (runtime.enabled ?? process.env.LIBRARY_ENABLED ?? 'true') !== 'false',
  }
}

export const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.avif',
  '.heic',
  '.heif',
])

export const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.mkv',
  '.webm',
  '.avi',
  '.mts',
  '.m2ts',
])

export const getLibraryMounts = (): LibraryMount[] => {
  const cfg = getLibraryConfig()
  return [
    {
      name: 'photos',
      type: 'image',
      root: cfg.photosPath,
      extensions: IMAGE_EXTENSIONS,
      routePrefix: '/library/photos',
    },
    {
      name: 'videos',
      type: 'video',
      root: cfg.videosPath,
      extensions: VIDEO_EXTENSIONS,
      routePrefix: '/library/videos',
    },
  ]
}