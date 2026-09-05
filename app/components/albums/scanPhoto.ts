// 扫描相簿目录照片的轻量结构：仅含缩略图/原图/长宽比/标题/拍摄时间，
// 供扫描相簿的瀑布流卡片与 WebGL 纹理查看器消费（不与全局 Photo 类型耦合）
export interface ScanPhoto {
  id: string
  thumbnailUrl: string | null
  thumbnailHash: string | null
  aspectRatio: number | null
  originalUrl: string | null
  /** 展示标题（如文件主名），供查看器工具栏展示 */
  title?: string | null
  /** 拍摄时间（ISO 字符串），供查看器工具栏展示 */
  dateTaken?: string | null
}