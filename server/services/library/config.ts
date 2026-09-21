import path from 'node:path'

/**
 * 媒体库配置（仅剩兼容字段：photosPath/videosPath 已不再用于自动扫描挂载）
 *
 * 自迁移后：程序只有外部扫描库（scan-library）触发自动识别；纯存储目录（/app/storage）
 * 只作上传落盘 + 统一缩略图存储，绝不扫描。下列 photosPath/videosPath 字段仅保留供 system/stats
 * 与旧接口读取，不再参与构建挂载。
 *
 * 环境变量（历史/镜像默认，当前已不驱动扫描）：
 *   LIBRARY_PHOTOS_PATH / LIBRARY_VIDEOS_PATH
 *   LIBRARY_THUMBNAIL_DIR
 */
export interface LibraryConfig {
  /** 图片目录绝对路径（兼容保留，不再用于扫描） */
  photosPath: string
  /** 视频目录绝对路径（兼容保留，不再用于扫描） */
  videosPath: string
  /** 缩略图写入的相对目录（位于本地存储 basePath 下） */
  thumbnailDir: string
  /** 是否启用自动扫描（对外部扫描库同样生效） */
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
  '.svg',
  // 相机 RAW：扫描库内放 RAW 即自动识别；缩略图/展示由服务端提取内嵌 JPEG 预览
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

// 内置媒体库挂载（photos/videos）已移除：不再内置 /app/photos、/app/videos 扫描入口。
// 纯存储目录（/app/storage）只作上传落盘 + 统一缩略图存储，绝不自动扫描；
// 只有用户显式添加的外部扫描库（scan-library）才触发自动识别。见 scan-library/manager。