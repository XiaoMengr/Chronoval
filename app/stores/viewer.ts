import type { Photo } from '~~/server/utils/db'

export const useViewerState = defineStore('photo-viewer-state', () => {
  const currentPhotoIndex = ref(0)
  const isViewerOpen = ref(false)
  const returnRoute = ref<string | null>(null)
  const isDirectAccess = ref(false)
  // 独立 360° 全景球面查看器（与普通照片查看器完全分离）
  const panoramaPhoto = ref<Photo | null>(null)
  const isPanoramaViewerOpen = ref(false)
  // The photo collection the current viewing session navigates (e.g. an album).
  // When null, the viewer falls back to the global photo list.
  const scopedPhotos = ref<Photo[] | null>(null)

  const openViewer = (
    index: number,
    route?: string | null,
    photos?: Photo[] | null,
  ) => {
    currentPhotoIndex.value = index
    isViewerOpen.value = true
    // Every open resets the scope: album-like contexts pass an explicit photo
    // collection, while the global gallery / direct access pass null (or omit
    // it) to fall back to the global list.
    scopedPhotos.value = photos ?? null
    if (route) {
      returnRoute.value = route
      isDirectAccess.value = false
    } else {
      isDirectAccess.value = true
    }
  }

  const switchToIndex = (index: number) => {
    currentPhotoIndex.value = index
  }

  const closeViewer = () => {
    isViewerOpen.value = false
  }

  // 独立全景查看器：传入 360 全景照片即打开球面查看，普通照片查看器保持关闭
  const openPanoramaViewer = (photo: Photo) => {
    panoramaPhoto.value = photo
    isPanoramaViewerOpen.value = true
  }

  const closePanoramaViewer = () => {
    isPanoramaViewerOpen.value = false
    panoramaPhoto.value = null
  }

  const clearReturnRoute = () => {
    returnRoute.value = null
  }

  return {
    currentPhotoIndex,
    isViewerOpen,
    returnRoute,
    isDirectAccess,
    scopedPhotos,
    panoramaPhoto,
    isPanoramaViewerOpen,
    openViewer,
    switchToIndex,
    closeViewer,
    openPanoramaViewer,
    closePanoramaViewer,
    clearReturnRoute,
  }
})
