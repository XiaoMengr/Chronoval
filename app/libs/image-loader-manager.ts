import { fileTypeFromBlob } from 'file-type'
import { LRUCache } from './lru'

export interface ImageLoaderState {
  isVisible: boolean
  isHeic?: boolean
  progress?: number
  bytesLoaded?: number
  bytesTotal?: number
  isConverting?: boolean
  message?: string
  codec?: string
}

export interface ImageLoaderCallbacks {
  onProgress?: (progress: number) => void
  onError?: () => void
  onUpdateLoadingState?: (state: Partial<ImageLoaderState>) => void
}

export interface ImageLoaderResult {
  blobSrc: string
  resultUrl?: string
}

export interface ImageLoaderCacheResult {
  blobSrc: string
  originalSize: number
  format: string
}

const normalImageCache: LRUCache<string, ImageLoaderCacheResult> = new LRUCache<
  string,
  ImageLoaderCacheResult
>(6, (v, k, reason) => {
  try {
    URL.revokeObjectURL(v.blobSrc)
    console.log(`已释放 Blob URL - ${k} (${reason})`)
  } catch (err) {
    console.warn(`Blob URL 释放失败 (${k}):`, err)
  }
})

export class ImageLoaderManager {
  private lastXHR: XMLHttpRequest | null = null
  private timer: NodeJS.Timeout | null = null

  private async isValidImageBlob(blob: Blob): Promise<boolean> {
    if (blob.size === 0) return false

    try {
      const fileType = await fileTypeFromBlob(blob)

      if (!fileType) return false
      if (!fileType.mime.startsWith('image/')) return false

      return true
    } catch {
      return false
    }
  }

  async loadImage(
    src: string,
    callbacks: ImageLoaderCallbacks = {},
  ): Promise<ImageLoaderResult> {
    const { onProgress, onError, onUpdateLoadingState } = callbacks

    // 命中内存缓存则立即返回，跳过网络下载与人为延迟，
    // 让相邻图片切换（渐进式预解码已预取）可以秒级起点解码。
    const cached = normalImageCache.get(src)
    if (cached) {
      return { blobSrc: cached.blobSrc }
    }

    onUpdateLoadingState?.({
      isVisible: true,
    })

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      this.lastXHR = xhr
      xhr.open('GET', src)
      xhr.responseType = 'blob'

      xhr.onload = async () => {
        if (xhr.status === 200) {
          try {
            const blob = xhr.response as Blob
            if (!(await this.isValidImageBlob(blob))) {
              onError?.()
              onUpdateLoadingState?.({
                isVisible: false,
              })
              return
            }

            const processResult = await this.processNormalImage(
              blob,
              src,
              callbacks,
            )
            resolve(processResult)
          } catch (err) {
            onError?.()
            onUpdateLoadingState?.({
              isVisible: false,
            })
            reject(err)
          }
        } else {
          onError?.()
          onUpdateLoadingState?.({
            isVisible: false,
          })
          reject(new Error(`Failed to load image: ${xhr.status}`))
        }
      }

      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100
          onProgress?.(progress)
          onUpdateLoadingState?.({
            progress,
            bytesLoaded: event.loaded,
            bytesTotal: event.total,
          })
        }
      }

      xhr.onerror = () => {
        onError?.()
        onUpdateLoadingState?.({
          isVisible: false,
        })
        reject(new Error(`Failed to load image`))
      }

      xhr.send()
    })
  }

  async processNormalImage(
    blob: Blob,
    originalUrl: string,
    callbacks: ImageLoaderCallbacks,
  ) {
    const { onUpdateLoadingState } = callbacks
    const cacheKey = originalUrl
    const cacheResult = normalImageCache.get(cacheKey)
    if (cacheResult) {
      onUpdateLoadingState?.({
        isVisible: false,
      })
      return {
        blobSrc: cacheResult.blobSrc,
      }
    }
    const url = URL.createObjectURL(blob)
    const result: ImageLoaderCacheResult = {
      blobSrc: url,
      originalSize: blob.size,
      format: blob.type,
    }
    normalImageCache.set(cacheKey, result)
    onUpdateLoadingState?.({
      isVisible: false,
    })
    // 返回内存中的 Blob URL，让 WebGL 直接解码本地缓存，切换图片不再重复联网下载
    return {
      blobSrc: url,
    }
  }

  /**
   * 渐进式预解码：把指定图片的全尺寸数据静默拉取进 Blob 缓存（不进加载 UI、
   * 不触发进度回调）。当用户随后切换到这张图片时，会命中缓存并立即得到 Blob URL。
   */
  async prefetch(src: string): Promise<boolean> {
    if (!src || normalImageCache.get(src)) return true

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', src)
      xhr.responseType = 'blob'
      xhr.onload = async () => {
        if (xhr.status === 200) {
          const blob = xhr.response as Blob
          if (await this.isValidImageBlob(blob)) {
            const url = URL.createObjectURL(blob)
            normalImageCache.set(src, {
              blobSrc: url,
              originalSize: blob.size,
              format: blob.type,
            })
            resolve(true)
            return
          }
        }
        resolve(false)
      }
      xhr.onerror = () => resolve(false)
      xhr.onabort = () => resolve(false)
      xhr.send()
    })
  }

  cleanup() {
    if (this.lastXHR) {
      this.lastXHR.abort()
      this.lastXHR = null
    }
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
