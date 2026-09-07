<script lang="ts" setup>
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Photo, PipelineQueueItem } from '~~/server/utils/db'
import { resolveComponent } from 'vue'
import { Icon, UBadge } from '#components'
import ThumbImage from '~/components/ui/ThumbImage.vue'

const Rating = resolveComponent('Rating')

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.photos'),
})

const maxFileSizeMB = computed(() => {
  const val = getSetting('system:upload.maxFileSize')
  return typeof val === 'number' ? val : 256
})

const systemUploadEraseLocationDefault = computed(() => {
  const val = getSetting('privacy:upload.autoEraseLocation')
  return typeof val === 'boolean' ? val : false
})

const dayjs = useDayjs()

const { status, refresh } = usePhotos()
const { filteredPhotos, selectedCounts, hasActiveFilters } = usePhotoFilters()

const totalSelectedFilters = computed(() => {
  return Object.values(selectedCounts.value).reduce(
    (total, count) => total + count,
    0,
  )
})

const reverseGeocodeLoading = ref<Record<string, boolean>>({})
const eraseLocationLoading = ref<Record<string, boolean>>({})

const setReverseGeocodeLoading = (photoId: string, loading: boolean) => {
  if (loading) {
    reverseGeocodeLoading.value = {
      ...reverseGeocodeLoading.value,
      [photoId]: true,
    }
  } else {
    const { [photoId]: _removed, ...rest } = reverseGeocodeLoading.value
    reverseGeocodeLoading.value = rest
  }
}

const setEraseLocationLoading = (photoId: string, loading: boolean) => {
  if (loading) {
    eraseLocationLoading.value = {
      ...eraseLocationLoading.value,
      [photoId]: true,
    }
  } else {
    const { [photoId]: _removed, ...rest } = eraseLocationLoading.value
    eraseLocationLoading.value = rest
  }
}

// 表态数据
const reactionsData = ref<Record<string, Record<string, number>>>({})
const reactionsLoading = ref(false)

// 获取表态数据
const fetchReactions = async (photoIds: string[]) => {
  if (photoIds.length === 0) return

  reactionsLoading.value = true
  try {
    const data = await $fetch<Record<string, Record<string, number>>>(
      '/api/photos/reactions',
      {
        query: { ids: photoIds },
      },
    )
    // 增量合并，避免整体替换导致表格所有表态列重渲染
    reactionsData.value = { ...reactionsData.value, ...data }
  } catch (error) {
    console.error('获取表态数据失败:', error)
  } finally {
    reactionsLoading.value = false
  }
}

interface UploadingFile {
  file: File
  fileName: string
  fileId: string
  status:
    | 'waiting'
    | 'preparing'
    | 'uploading'
    | 'processing'
    | 'completed'
    | 'error'
    | 'skipped'
    | 'blocked'
  stage?: PipelineQueueItem['statusStage'] | null
  progress?: number
  error?: string
  warning?: string
  taskId?: number
  signedUrlResponse?: { signedUrl: string; fileKey: string; expiresIn: number }
  uploadProgress?: {
    loaded: number
    total: number
    percentage: number
    speed?: number
    timeRemaining?: number
    speedText?: string
    timeRemainingText?: string
  }
  canAbort?: boolean
  abortUpload?: () => void
}

const uploadingFiles = ref<Map<string, UploadingFile>>(new Map())

interface EditFormState {
  title: string
  description: string
  tags: string[]
  rating: number | null
}

const editingPhoto = ref<Photo | null>(null)
const isEditModalOpen = ref(false)
const isSavingMetadata = ref(false)

const editFormState = reactive<EditFormState>({
  title: '',
  description: '',
  tags: [],
  rating: null,
})

const originalMetadata = ref<{
  title: string
  description: string
  tags: string[]
  location: { latitude: number; longitude: number } | null
  rating: number | null
}>({
  title: '',
  description: '',
  tags: [],
  location: null,
  rating: null,
})

const locationSelection = ref<{ latitude: number; longitude: number } | null>(
  null,
)
const locationTouched = ref(false)

const normalizeTagList = (tags: string[]): string[] => {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const tag of tags) {
    const trimmed = tag.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(trimmed)
  }
  return normalized
}

const areTagListsEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) {
    return false
  }
  return a.every((tag, index) => tag === b[index])
}

const tagsModel = computed<string[]>({
  get: () => editFormState.tags,
  set: (value) => {
    const next = Array.isArray(value) ? normalizeTagList(value) : []
    if (!areTagListsEqual(editFormState.tags, next)) {
      editFormState.tags = next
    }
  },
})

const normalizedTitle = computed(() => editFormState.title.trim())
const normalizedDescription = computed(() => editFormState.description.trim())

const tagsChanged = computed(() => {
  const current = editFormState.tags
  const original = originalMetadata.value.tags
  return !areTagListsEqual(current, original)
})

const titleChanged = computed(
  () => normalizedTitle.value !== originalMetadata.value.title,
)
const descriptionChanged = computed(
  () => normalizedDescription.value !== originalMetadata.value.description,
)

const locationChanged = computed(() => {
  if (!locationTouched.value) {
    return false
  }
  const current = locationSelection.value
  const original = originalMetadata.value.location
  if (!current && !original) {
    return false
  }
  if (!current || !original) {
    return true
  }
  return (
    Math.abs(current.latitude - original.latitude) > 1e-6 ||
    Math.abs(current.longitude - original.longitude) > 1e-6
  )
})

const ratingChanged = computed(
  () => editFormState.rating !== originalMetadata.value.rating,
)

const isMetadataDirty = computed(
  () =>
    titleChanged.value ||
    descriptionChanged.value ||
    tagsChanged.value ||
    locationChanged.value ||
    ratingChanged.value,
)

const formattedCoordinates = computed(() => {
  if (!locationSelection.value) {
    return null
  }
  return {
    latitude: locationSelection.value.latitude.toFixed(6),
    longitude: locationSelection.value.longitude.toFixed(6),
  }
})

const uploadImage = async (
  file: File,
  existingFileId?: string,
  eraseLocationOnUpload?: boolean,
  target: 'storage' | number = 'storage',
) => {
  const fileName = file.name
  const fileId = existingFileId || `${Date.now()}-${fileName}`

  const uploadManager = useUpload({
    timeout: 10 * 60 * 1000, // 10分钟超时
  })

  // 本次上传的目标扫描库 id（'storage' 表示本地存储）
  const targetLibraryId = target === 'storage' ? undefined : target

  // 获取或创建 uploadingFile
  let uploadingFile = uploadingFiles.value.get(fileId)
  if (!uploadingFile) {
    uploadingFile = {
      file,
      fileName,
      fileId,
      status: 'preparing',
      canAbort: false,
      abortUpload: () => uploadManager.abortUpload(),
    }
    uploadingFiles.value.set(fileId, uploadingFile)
  } else {
    // 更新现有条目的状态和回调
    uploadingFile.status = 'preparing'
    uploadingFile.canAbort = false
    uploadingFile.warning = undefined
    uploadingFile.abortUpload = () => uploadManager.abortUpload()
    uploadingFiles.value = new Map(uploadingFiles.value)
  }

  try {
    // 第一步：获取预签名 URL
    uploadingFile.status = 'preparing'
    const signedUrlResponse = await $fetch('/api/photos', {
      method: 'POST',
      body: {
        fileName: file.name,
        contentType: file.type,
        ...(targetLibraryId != null
          ? { targetLibraryId }
          : {}),
      },
    })

    uploadingFile.signedUrlResponse = signedUrlResponse

    // 检查是否为跳过模式（重复文件）
    if (signedUrlResponse.skipped) {
      uploadingFile.status = 'skipped'
      uploadingFile.progress = 100
      uploadingFile.canAbort = false
      uploadingFile.error =
        signedUrlResponse.message ||
        $t('upload.duplicate.skip.message', { fileName })

      toast.add({
        title: signedUrlResponse.title || $t('upload.duplicate.skip.title'),
        description:
          signedUrlResponse.message ||
          $t('upload.duplicate.skip.message', { fileName }),
        color: 'warning',
      })

      uploadingFiles.value = new Map(uploadingFiles.value)
      return
    }

    if (signedUrlResponse.warningInfo) {
      uploadingFile.error = undefined
      uploadingFile.warning =
        signedUrlResponse.warningInfo.warning ||
        signedUrlResponse.warningInfo.message

      uploadingFiles.value = new Map(uploadingFiles.value)
    }

    uploadingFile.status = 'uploading'
    uploadingFile.canAbort = true
    uploadingFile.progress = 0
    uploadingFiles.value = new Map(uploadingFiles.value)

    // 第二步：使用 composable 上传文件到存储
    await uploadManager.uploadFile(file, signedUrlResponse.signedUrl, {
      onProgress: (progress: UploadProgress) => {
        uploadingFile.progress = progress.percentage
        uploadingFile.uploadProgress = {
          loaded: progress.loaded,
          total: progress.total,
          percentage: progress.percentage,
          speed: progress.speed,
          timeRemaining: progress.timeRemaining,
          speedText: progress.speed ? `${formatBytes(progress.speed)}/s` : '',
          timeRemainingText: progress.timeRemaining
            ? dayjs.duration(progress.timeRemaining, 'seconds').humanize()
            : '',
        }
        uploadingFiles.value = new Map(uploadingFiles.value)
      },
      onStatusChange: (status: string) => {
        uploadingFile.canAbort = status === 'uploading'
        uploadingFiles.value = new Map(uploadingFiles.value)
      },
      onSuccess: async (_xhr: XMLHttpRequest) => {
        // 第三步：上传完成，提交到队列任务
        uploadingFile.status = 'processing'
        uploadingFile.progress = 100
        uploadingFile.canAbort = false
        uploadingFile.stage = null // 重置 stage，准备显示任务状态
        uploadingFiles.value = new Map(uploadingFiles.value)

        // 入库上传：文件已写完到选定扫描库目录，直接触发该库扫描使其被索引，跳过本地处理管道
        if (signedUrlResponse?.library) {
          const libId = Number(signedUrlResponse.library.id)
          try {
            await $fetch(`/api/scan-library/${libId}/scan`, {
              method: 'POST',
            })
            uploadingFile.status = 'completed'
            uploadingFile.progress = 100
            uploadingFile.stage = null
            uploadingFile.canAbort = false
            uploadingFiles.value = new Map(uploadingFiles.value)
          } catch (scanError: any) {
            uploadingFile.status = 'error'
            uploadingFile.canAbort = false
            uploadingFile.error =
              scanError?.message ||
              $t('dashboard.photos.messages.uploadFailed')
            uploadingFiles.value = new Map(uploadingFiles.value)
          }
          return
        }

        try {
          // 检查是否为MOV视频文件（通过MIME类型或文件扩展名）
          const isMovFile =
            file.type === 'video/quicktime' ||
            file.type === 'video/mp4' ||
            file.name.toLowerCase().endsWith('.mov')

          const resp = await $fetch('/api/queue/add-task', {
            method: 'POST',
            body: {
              payload: {
                type: isMovFile ? 'live-photo-video' : 'photo',
                storageKey: signedUrlResponse.fileKey,
                ...(isMovFile
                  ? {}
                  : {
                      eraseLocation:
                        eraseLocationOnUpload ??
                        systemUploadEraseLocationDefault.value,
                    }),
              },
              priority: isMovFile ? 0 : 1, // Live Photo 视频优先级更低，确保图片优先处理
              maxAttempts: 3,
            },
          })

          if (resp.success) {
            uploadingFile.taskId = resp.taskId
            uploadingFile.status = 'processing'
            uploadingFiles.value = new Map(uploadingFiles.value)

            // 开始任务状态检查
            startTaskStatusCheck(resp.taskId, fileId)
          } else {
            uploadingFile.status = 'error'
            uploadingFile.error = $t(
              'dashboard.photos.messages.taskSubmitFailed',
            )
            uploadingFiles.value = new Map(uploadingFiles.value)
          }
        } catch (processError: any) {
          uploadingFile.status = 'error'
          uploadingFile.error = `${$t('dashboard.photos.messages.taskSubmitFailed')}: ${processError.message}`
          uploadingFile.canAbort = false
          uploadingFiles.value = new Map(uploadingFiles.value)
        }
      },
      onError: (error: string) => {
        const isConflict = /\b409\b|Conflict/i.test(error)

        if (isConflict) {
          uploadingFile.status = 'blocked'
          uploadingFile.error = $t('upload.duplicate.block.message', {
            fileName,
          })
        } else {
          uploadingFile.status = 'error'
          uploadingFile.error = error
        }

        uploadingFile.canAbort = false
        uploadingFiles.value = new Map(uploadingFiles.value)
      },
    })
  } catch (error: any) {
    uploadingFile.status = 'error'
    uploadingFile.canAbort = false

    // 处理重复文件阻止模式的错误
    const isDuplicateConflict =
      (error.statusCode === 409 ||
        error.status === 409 ||
        error.response?.status === 409) &&
      (error.data?.duplicate || /Conflict|409/i.test(error.message || ''))

    if (isDuplicateConflict) {
      uploadingFile.status = 'blocked'
      uploadingFile.error =
        error.data.message || $t('upload.duplicate.block.message', { fileName })

      toast.add({
        title: error.data?.title || $t('upload.duplicate.block.title'),
        description:
          error.data?.message ||
          $t('upload.duplicate.block.message', { fileName }),
        color: 'error',
      })
    } else {
      // 其他错误
      uploadingFile.error =
        error.message || $t('dashboard.photos.messages.uploadFailed')
    }

    uploadingFiles.value = new Map(uploadingFiles.value)

    // 提供更详细的错误信息
    if (error.response?.status === 401) {
      uploadingFile.error = $t('dashboard.photos.errors.uploadUnauthorized')
    } else if (error.message?.includes('CORS')) {
      uploadingFile.error = $t('dashboard.photos.errors.uploadCorsError')
    } else if (
      error.message?.includes('NetworkError') ||
      error.name === 'TypeError'
    ) {
      uploadingFile.error = $t('dashboard.photos.errors.uploadNetworkError')
    } else if (error.message?.includes('上传到存储失败')) {
      uploadingFile.error = $t('dashboard.photos.messages.uploadFailed')
    }

    uploadingFiles.value = new Map(uploadingFiles.value)
  }
}

const toast = useToast()
const selectedFiles = ref<File[]>([])
const isUploadSlideoverOpen = ref(false)
const uploadEraseLocationEnabled = ref(systemUploadEraseLocationDefault.value)

// —— 上传目标位置：'storage'（本地存储默认）或某个扫描库 id ——
const { data: uploadScanLibraries } = await useFetch<{
  libraries: Array<{
    id: number
    name: string
    rootPath: string
    provider: string
    enabled: boolean
  }>
}>('/api/scan-library')
const enabledUploadLibraries = computed(() =>
  (uploadScanLibraries.value?.libraries ?? []).filter((lib) => lib.enabled),
)
const uploadTarget = ref<'storage' | number>('storage')
const hasSelectedUploadLibrary = computed(() => uploadTarget.value !== 'storage')

const hasSelectedFiles = computed(() => selectedFiles.value.length > 0)

const selectedFilesTotalSize = computed(() =>
  selectedFiles.value.reduce((total, file) => total + (file?.size || 0), 0),
)

const selectedFilesTotalSizeLabel = computed(() =>
  selectedFilesTotalSize.value > 0
    ? formatBytes(selectedFilesTotalSize.value)
    : '0 B',
)

const selectedFilesSummary = computed(() => {
  if (!selectedFiles.value.length) {
    return $t('dashboard.photos.slideover.footer.noSelection')
  }

  return $t('dashboard.photos.slideover.footer.prepared', {
    count: selectedFiles.value.length,
    size: selectedFilesTotalSizeLabel.value,
  })
})

const clearSelectedFiles = () => {
  selectedFiles.value = []
}

watch(isUploadSlideoverOpen, (open) => {
  if (!open) {
    clearSelectedFiles()
    uploadEraseLocationEnabled.value = systemUploadEraseLocationDefault.value
  }
})

const openUploadSlideover = () => {
  uploadEraseLocationEnabled.value = systemUploadEraseLocationDefault.value
  isUploadSlideoverOpen.value = true
}

watch(isEditModalOpen, (open) => {
  if (!open) {
    editingPhoto.value = null
    editFormState.title = ''
    editFormState.description = ''
    editFormState.tags = []
    editFormState.rating = null
    originalMetadata.value = {
      title: '',
      description: '',
      tags: [],
      location: null,
      rating: null,
    }
    locationSelection.value = null
    locationTouched.value = false
  }
})

// 瀑布流多选状态：用独立 Set 管理选中照片（替代原表格 rowSelection + tableApi）
const selectedPhotoIds = ref<Set<string>>(new Set())
const hasSelection = computed(() => selectedPhotoIds.value.size > 0)
const selectedRowsCount = computed(() => selectedPhotoIds.value.size)
const isPhotoSelected = (id: string) => selectedPhotoIds.value.has(id)
// 选择模式：默认关闭，点击工具栏按钮后才进入，此时才显示照片上的方形选择框
const isSelectionMode = ref(false)
const selectModeLabel = computed(() =>
  $t(
    isSelectionMode.value
      ? 'dashboard.photos.selection.exitSelectMode'
      : 'dashboard.photos.selection.enterSelectMode',
  ),
)
const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value
  if (!isSelectionMode.value) {
    clearSelection()
  }
}
const togglePhotoSelection = (photo: Photo) => {
  const next = new Set(selectedPhotoIds.value)
  if (next.has(photo.id)) next.delete(photo.id)
  else next.add(photo.id)
  selectedPhotoIds.value = next
}
const clearSelection = () => {
  selectedPhotoIds.value = new Set()
}
// 选中全部可见照片
const selectAllVisiblePhotos = () => {
  const ids = new Set(selectedPhotoIds.value)
  filteredData.value.forEach((p) => ids.add(p.id))
  selectedPhotoIds.value = ids
}
const livePhotoStats = computed(() => {
  if (!filteredPhotos.value) return { total: 0, livePhotos: 0, staticPhotos: 0 }

  const total = filteredPhotos.value.length
  const livePhotos = filteredPhotos.value.filter(
    (photo: Photo) => photo.isLivePhoto,
  ).length
  const staticPhotos = total - livePhotos

  return { total, livePhotos, staticPhotos }
})

const photoFilter = ref<'all' | 'livephoto' | 'static'>('all')

const filteredData = computed(() => {
  if (!filteredPhotos.value) return []

  let list: Photo[]
  switch (photoFilter.value) {
    case 'livephoto':
      list = filteredPhotos.value.filter((photo: Photo) => photo.isLivePhoto)
      break
    case 'static':
      list = filteredPhotos.value.filter((photo: Photo) => !photo.isLivePhoto)
      break
    default:
      list = filteredPhotos.value
  }

  // 管理视图排序：「最新上传在前」。优先按 createdAt（入库/上传时间）降序，
  // 其次按拍摄时间 dateTaken 降序，保证新上传的照片排在最前面。
  return [...list].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
    if (ta !== tb) return tb - ta
    return (
      new Date(b.dateTaken || 0).getTime() - new Date(a.dateTaken || 0).getTime()
    )
  })
})

const selectedPhotosList = computed(() =>
  filteredData.value.filter((p) => selectedPhotoIds.value.has(p.id)),
)
const totalRowsCount = computed(() => filteredData.value.length)

// 管理瀑布流每张砖的固有比例：优先用已入库的 CSS 长宽比（width/height），
// 其次按宽高推算，缺失时兜底 3:4，供 MasonryWall 正确分摊列高、避免排版跳动。
const aspectStyle = (p: Photo) => {
  let ratio = p.aspectRatio
  if (!ratio && p.width && p.height) ratio = p.width / p.height
  return { aspectRatio: ratio ? String(ratio) : '3 / 4' }
}

// 瀑布流增量渲染：首屏只挂载有限数量，滚动到底部哨兵再追加，避免大水库一次铺满全部 DOM
const MASONRY_STEP = 60
const masonryRenderedCount = ref(0)
const masonryScrollContainerRef = ref<HTMLElement>()
const masonrySentinelRef = ref<HTMLElement>()
const masonryObserver = ref<IntersectionObserver | null>(null)
const masonryItems = computed(() =>
  filteredData.value.slice(0, masonryRenderedCount.value).map((photo, i) => ({
    id: photo.id,
    photo,
    originalIndex: i,
  })),
)
watch(
  () => filteredData.value,
  () => {
    masonryRenderedCount.value = filteredData.value.length
      ? Math.min(60, filteredData.value.length)
      : 0
  },
  { immediate: true },
)
const appendMasonryBatch = () => {
  const total = filteredData.value?.length ?? 0
  if (masonryRenderedCount.value >= total) return
  masonryRenderedCount.value = Math.min(
    masonryRenderedCount.value + MASONRY_STEP,
    total,
  )
}
onMounted(() => {
  if (masonrySentinelRef.value) {
    // 以内部滚动容器为根：瀑布流在受高度约束的面板内滚动，哨兵据此判断何时追加下一批
    const root = masonryScrollContainerRef.value || null
    masonryObserver.value = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) appendMasonryBatch()
      },
      { root, rootMargin: '1200px 0px 0px 0px', threshold: 0 },
    )
    masonryObserver.value.observe(masonrySentinelRef.value)
  }
})
onUnmounted(() => {
  masonryObserver.value?.disconnect()
  masonryObserver.value = null
})

// 监听过滤后的照片变化，自动获取表态数据（300ms 防抖，合并连续筛选动作）
let reactionsTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => filteredData.value,
  (photos) => {
    if (reactionsTimer) clearTimeout(reactionsTimer)
    reactionsTimer = setTimeout(() => {
      if (photos && photos.length > 0) {
        fetchReactions((photos as Photo[]).map((p) => p.id))
      }
    }, 300)
  },
  { immediate: true },
)
onUnmounted(() => {
  if (reactionsTimer) clearTimeout(reactionsTimer)
})

// 状态检查间隔 Map，每个任务对应一个定时器
const statusIntervals = ref<Map<number, NodeJS.Timeout>>(new Map())

// 启动任务状态检查
const startTaskStatusCheck = (taskId: number, fileId: string) => {
  const intervalId = setInterval(async () => {
    try {
      const response = await $fetch(`/api/queue/stats/${taskId}`)
      const uploadingFile = uploadingFiles.value.get(fileId)

      if (!uploadingFile) {
        clearInterval(intervalId)
        statusIntervals.value.delete(taskId)
        return
      }

      // 更新任务状态
      uploadingFile.stage =
        response.status === 'in-stages' ? response.statusStage : null
      uploadingFiles.value = new Map(uploadingFiles.value)

      if (response.status === 'completed') {
        // 任务完成
        uploadingFile.status = 'completed'
        uploadingFile.stage = null
        uploadingFiles.value = new Map(uploadingFiles.value)

        // 停止状态检查
        clearInterval(intervalId)
        statusIntervals.value.delete(taskId)

        // 不再显示单独的成功提示，由上传组件统一处理

        // 刷新照片列表
        await refresh()

        // 2秒后从界面移除成功的任务
        // setTimeout(() => {
        //   uploadingFiles.value.delete(fileId)
        //   uploadingFiles.value = new Map(uploadingFiles.value)
        // }, 2000)
      } else if (response.status === 'failed') {
        // 任务失败
        uploadingFile.status = 'error'
        uploadingFile.error = `${$t('dashboard.photos.messages.error')}: ${response.errorMessage || $t('dashboard.photos.table.cells.unknown')}`
        uploadingFile.stage = null
        uploadingFiles.value = new Map(uploadingFiles.value)

        // 停止状态检查
        clearInterval(intervalId)
        statusIntervals.value.delete(taskId)

        // 错误信息已在上传组件中显示，不需要额外通知
        // 失败的任务不自动移除，让用户查看错误信息
      }
    } catch (error) {
      console.error('检查任务状态失败:', error)

      // 如果检查状态失败，清理定时器
      clearInterval(intervalId)
      statusIntervals.value.delete(taskId)

      const uploadingFile = uploadingFiles.value.get(fileId)
      if (uploadingFile) {
        uploadingFile.status = 'error'
        uploadingFile.error = $t(
          'dashboard.photos.messages.taskStatusCheckFailed',
        )
        uploadingFiles.value = new Map(uploadingFiles.value)
      }
    }
  }, 1000) // 每秒检查一次

  statusIntervals.value.set(taskId, intervalId)
}

// 手动移除上传任务
const removeUploadingFile = (fileId: string) => {
  const uploadingFile = uploadingFiles.value.get(fileId)

  // 如果任务还在进行中，先清理定时器
  if (uploadingFile?.taskId) {
    const intervalId = statusIntervals.value.get(uploadingFile.taskId)
    if (intervalId) {
      clearInterval(intervalId)
      statusIntervals.value.delete(uploadingFile.taskId)
    }
  }

  // 从列表中移除
  uploadingFiles.value.delete(fileId)
  uploadingFiles.value = new Map(uploadingFiles.value)
}

// 批量清除已完成和错误的任务
const clearCompletedTasks = () => {
  const toRemove: string[] = []

  for (const [fileId, uploadingFile] of uploadingFiles.value) {
    if (
      uploadingFile.status === 'completed' ||
      uploadingFile.status === 'error'
    ) {
      toRemove.push(fileId)

      // 清理可能存在的定时器
      if (uploadingFile.taskId) {
        const intervalId = statusIntervals.value.get(uploadingFile.taskId)
        if (intervalId) {
          clearInterval(intervalId)
          statusIntervals.value.delete(uploadingFile.taskId)
        }
      }
    }
  }

  toRemove.forEach((fileId) => {
    uploadingFiles.value.delete(fileId)
  })

  uploadingFiles.value = new Map(uploadingFiles.value)

  if (toRemove.length > 0) {
    toast.add({
      title: $t('dashboard.photos.uploadQueue.taskCleared'),
      description: $t('dashboard.photos.uploadQueue.tasksCleared', {
        count: toRemove.length,
      }),
      color: 'info',
    })
  }
}

// 清除已完成的上传
const clearCompletedUploads = () => {
  clearCompletedTasks()
}

// 清除所有上传
const clearAllUploads = () => {
  const toRemove: string[] = []

  for (const [fileId, uploadingFile] of uploadingFiles.value) {
    toRemove.push(fileId)

    // 如果是正在上传的任务，先中止
    if (uploadingFile.status === 'uploading' && uploadingFile.abortUpload) {
      uploadingFile.abortUpload()
    }

    // 清理状态检查定时器
    if (uploadingFile.taskId) {
      const intervalId = statusIntervals.value.get(uploadingFile.taskId)
      if (intervalId) {
        clearInterval(intervalId)
        statusIntervals.value.delete(uploadingFile.taskId)
      }
    }
  }

  uploadingFiles.value.clear()
  uploadingFiles.value = new Map(uploadingFiles.value)

  if (toRemove.length > 0) {
    toast.add({
      title: $t('dashboard.photos.uploadQueue.allTasksCleared'),
      description: $t('dashboard.photos.uploadQueue.tasksCleared', {
        count: toRemove.length,
      }),
      color: 'info',
    })
  }
}


// 文件验证函数
const validateFile = (
  file: File,
): {
  valid: boolean
  error?: string
  reason?: 'unsupported-format' | 'file-too-large'
} => {
  // 检查文件类型
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'video/quicktime', // MOV 文件
  ]

  const isValidImageType = allowedTypes.includes(file.type)
  const isValidImageExtension = ['.heic', '.heif'].some((ext) =>
    file.name.toLowerCase().endsWith(ext),
  )
  const isValidVideoExtension = file.name.toLowerCase().endsWith('.mov')

  if (!isValidImageType && !isValidImageExtension && !isValidVideoExtension) {
    return {
      valid: false,
      reason: 'unsupported-format',
      error: $t('dashboard.photos.errors.unsupportedFormat', {
        type: file.type,
      }),
    }
  }

  const maxSize = maxFileSizeMB.value * 1024 * 1024
  if (file.size > maxSize) {
    return {
      valid: false,
      reason: 'file-too-large',
      error: $t('dashboard.photos.errors.fileTooLarge', {
        size: (file.size / 1024 / 1024).toFixed(2),
        maxSize: maxFileSizeMB.value,
      }),
    }
  }

  return { valid: true }
}

const handleUpload = async () => {
  const fileList = selectedFiles.value

  if (fileList.length === 0) {
    return
  }

  const errors: string[] = []
  let tooLargeCount = 0
  let unsupportedCount = 0

  // 先验证所有文件
  const validFiles: File[] = []
  const fileIdMapping = new Map<File, string>()

  for (const file of fileList) {
    const validation = validateFile(file)
    if (!validation.valid) {
      errors.push(`${file.name}: ${validation.error}`)
      if (validation.reason === 'file-too-large') {
        tooLargeCount += 1
      } else if (validation.reason === 'unsupported-format') {
        unsupportedCount += 1
      }
    } else {
      validFiles.push(file)
      // 为每个有效文件生成唯一ID
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.name}`
      fileIdMapping.set(file, fileId)
    }
  }

  if (validFiles.length === 0) {
    if (tooLargeCount > 0 && unsupportedCount === 0) {
      toast.add({
        title: $t('upload.error.tooLarge.title'),
        description: $t('dashboard.photos.errors.allFilesTooLarge', {
          count: tooLargeCount,
          maxSize: maxFileSizeMB.value,
        }),
        color: 'error',
      })
    } else {
      toast.add({
        title: $t('dashboard.photos.messages.error'),
        description: $t('dashboard.photos.errors.allFilesValidationFailed'),
        color: 'error',
      })
    }

    return
  }

  if (tooLargeCount > 0) {
    toast.add({
      title: $t('upload.error.tooLarge.title'),
      description: $t('dashboard.photos.errors.filesTooLargeSkipped', {
        count: tooLargeCount,
        maxSize: maxFileSizeMB.value,
      }),
      color: 'warning',
    })
  } else if (unsupportedCount > 0) {
    toast.add({
      title: $t('dashboard.photos.errors.fileValidationFailed'),
      description: $t('dashboard.photos.errors.filesUnsupportedSkipped', {
        count: unsupportedCount,
      }),
      color: 'warning',
    })
  }

  // 立即为所有有效文件创建队列条目，状态为 waiting
  for (const file of validFiles) {
    const fileId = fileIdMapping.get(file)!
    const uploadingFile: UploadingFile = {
      file,
      fileName: file.name,
      fileId,
      status: 'waiting',
      canAbort: false,
    }
    uploadingFiles.value.set(fileId, uploadingFile)
  }

  // 触发队列更新
  uploadingFiles.value = new Map(uploadingFiles.value)

  // 动态并发上传，始终保持 CONCURRENT_LIMIT 个文件在上传
  const CONCURRENT_LIMIT = 3 // 限制同时上传的文件数量

  // 创建文件队列
  const fileQueue = [...validFiles]
  const activeUploads = new Set<Promise<void>>()

  // 启动上传任务的函数
  const startUpload = async (file: File): Promise<void> => {
    const fileId = fileIdMapping.get(file)!
    try {
      await uploadImage(
        file,
        fileId,
        uploadEraseLocationEnabled.value,
        uploadTarget.value,
      )
    } catch (error: any) {
      errors.push(`${file.name}: ${error.message || '上传失败'}`)
      console.error('上传错误:', error)
    }
  }

  // 处理队列的函数
  const processQueue = async (): Promise<void> => {
    while (fileQueue.length > 0 || activeUploads.size > 0) {
      // 如果当前活跃上传数量小于限制，且队列中还有文件，则启动新的上传
      while (activeUploads.size < CONCURRENT_LIMIT && fileQueue.length > 0) {
        const file = fileQueue.shift()!
        const uploadPromise = startUpload(file)

        activeUploads.add(uploadPromise)

        // 当上传完成时，从活跃集合中移除
        uploadPromise.finally(() => {
          activeUploads.delete(uploadPromise)
        })
      }

      // 如果有活跃的上传，等待至少一个完成
      if (activeUploads.size > 0) {
        await Promise.race(activeUploads)
      }
    }
  }

  // 开始处理队列
  await processQueue()

  if (errors.length > 0) {
    console.error('批量上传错误详情:', errors)
  }

  // 清空选中的文件
  selectedFiles.value = []
  isUploadSlideoverOpen.value = false
}

const openMetadataEditor = (photo: Photo) => {
  const initialTitle = photo.title?.trim() ?? ''
  const initialDescription = photo.description?.trim() ?? ''
  const initialTags = normalizeTagList(photo.tags ?? [])
  const hasCoordinates =
    typeof photo.latitude === 'number' && typeof photo.longitude === 'number'

  editingPhoto.value = photo
  editFormState.title = initialTitle
  editFormState.description = initialDescription
  editFormState.tags = [...initialTags]
  editFormState.rating =
    typeof photo.exif?.Rating === 'number' ? photo.exif.Rating : null

  const initialLocation = hasCoordinates
    ? {
        latitude: photo.latitude as number,
        longitude: photo.longitude as number,
      }
    : null

  originalMetadata.value = {
    title: initialTitle,
    description: initialDescription,
    tags: [...initialTags],
    location: initialLocation ? { ...initialLocation } : null,
    rating: typeof photo.exif?.Rating === 'number' ? photo.exif.Rating : null,
  }

  locationSelection.value = initialLocation ? { ...initialLocation } : null
  locationTouched.value = false

  isEditModalOpen.value = true
}

const handleLocationPick = () => {
  locationTouched.value = true
}

const clearSelectedLocation = () => {
  locationSelection.value = null
  locationTouched.value = true
}

const enqueueEraseLocationTask = async (photo: Photo) => {
  if (!photo?.id) {
    throw new Error($t('dashboard.photos.messages.photoNotFound'))
  }

  const result = await $fetch('/api/queue/add-task', {
    method: 'POST',
    body: {
      payload: {
        type: 'photo-erase-location',
        photoId: photo.id,
      },
      priority: 2,
      maxAttempts: 3,
    },
  })

  if (!result.success) {
    throw new Error(
      result?.message || $t('dashboard.photos.messages.eraseLocationFailed'),
    )
  }

  return result.taskId
}

const saveMetadataChanges = async () => {
  if (!editingPhoto.value || !isMetadataDirty.value) {
    return
  }

  isSavingMetadata.value = true
  try {
    const payload: {
      title?: string
      description?: string
      tags?: string[]
      location?: { latitude: number; longitude: number } | null
      rating?: number | null
    } = {}

    if (titleChanged.value) {
      payload.title = normalizedTitle.value
    }

    if (descriptionChanged.value) {
      payload.description = normalizedDescription.value
    }

    if (tagsChanged.value) {
      payload.tags = [...editFormState.tags]
    }

    const shouldQueueLocationErase =
      locationChanged.value && locationSelection.value === null

    if (locationChanged.value && locationSelection.value) {
      payload.location = {
        latitude: locationSelection.value.latitude,
        longitude: locationSelection.value.longitude,
      }
    }

    if (ratingChanged.value) {
      payload.rating = editFormState.rating
    }

    let hasAnySuccessfulAction = false

    if (Object.keys(payload).length > 0) {
      await $fetch(`/api/photos/${editingPhoto.value.id}`, {
        method: 'PUT',
        body: payload,
      })

      toast.add({
        title: $t('dashboard.photos.messages.metadataUpdateSuccess'),
        description: '',
        color: 'success',
      })
      hasAnySuccessfulAction = true
    }

    if (shouldQueueLocationErase) {
      const taskId = await enqueueEraseLocationTask(editingPhoto.value)
      toast.add({
        title: $t('dashboard.photos.messages.eraseLocationQueued'),
        description:
          typeof taskId === 'number'
            ? $t('dashboard.photos.messages.reprocessTaskId', { taskId })
            : '',
        color: 'success',
      })
      hasAnySuccessfulAction = true
    }

    if (!hasAnySuccessfulAction) {
      isEditModalOpen.value = false
      return
    }

    await refresh()
    isEditModalOpen.value = false
  } catch (error: any) {
    console.error('更新照片信息失败:', error)
    const message =
      error?.data?.statusMessage ||
      error?.statusMessage ||
      error?.message ||
      $t('dashboard.photos.messages.metadataUpdateFailed')

    toast.add({
      title: $t('dashboard.photos.messages.metadataUpdateFailed'),
      description: message,
      color: 'error',
    })
  } finally {
    isSavingMetadata.value = false
  }
}

const handleEditSubmit = async (event: FormSubmitEvent<EditFormState>) => {
  event.preventDefault()
  if (!isMetadataDirty.value) {
    return
  }
  await saveMetadataChanges()
}

const handleReverseGeocodeRequest = async (photo: Photo) => {
  if (!photo?.id) {
    return
  }

  setReverseGeocodeLoading(photo.id, true)

  try {
    const result = await $fetch('/api/queue/add-task', {
      method: 'POST',
      body: {
        payload: {
          type: 'photo-reverse-geocoding',
          photoId: photo.id,
          latitude:
            typeof photo.latitude === 'number' ? photo.latitude : undefined,
          longitude:
            typeof photo.longitude === 'number' ? photo.longitude : undefined,
        },
        priority: 1,
        maxAttempts: 3,
      },
    })

    if (result.success) {
      toast.add({
        title: $t('dashboard.photos.messages.reverseGeocodeQueued'),
        description:
          typeof result.taskId === 'number'
            ? $t('dashboard.photos.messages.reprocessTaskId', {
                taskId: result.taskId,
              })
            : '',
        color: 'success',
      })
    } else {
      toast.add({
        title: $t('dashboard.photos.messages.reverseGeocodeFailed'),
        description:
          result?.message ||
          $t('dashboard.photos.messages.reverseGeocodeFailed'),
        color: 'error',
      })
    }
  } catch (error: any) {
    console.error('Failed to enqueue reverse geocoding task:', error)
    const message =
      error?.data?.statusMessage ||
      error?.statusMessage ||
      error?.message ||
      $t('dashboard.photos.messages.reverseGeocodeFailed')

    toast.add({
      title: $t('dashboard.photos.messages.reverseGeocodeFailed'),
      description: message,
      color: 'error',
    })
  } finally {
    setReverseGeocodeLoading(photo.id, false)
  }
}

const handleEraseLocationRequest = async (photo: Photo) => {
  if (!photo?.id) {
    return
  }

  setEraseLocationLoading(photo.id, true)

  try {
    const taskId = await enqueueEraseLocationTask(photo)
    toast.add({
      title: $t('dashboard.photos.messages.eraseLocationQueued'),
      description:
        typeof taskId === 'number'
          ? $t('dashboard.photos.messages.reprocessTaskId', { taskId })
          : '',
      color: 'success',
    })
  } catch (error: any) {
    console.error('Failed to enqueue erase location task:', error)
    const message =
      error?.data?.statusMessage ||
      error?.statusMessage ||
      error?.message ||
      $t('dashboard.photos.messages.eraseLocationFailed')

    toast.add({
      title: $t('dashboard.photos.messages.eraseLocationFailed'),
      description: message,
      color: 'error',
    })
  } finally {
    setEraseLocationLoading(photo.id, false)
  }
}

// 重新处理单张照片
const handleReprocessSingle = async (photo: Photo) => {
  try {
    if (!photo || !photo.storageKey) {
      toast.add({
        title: $t('dashboard.photos.messages.error'),
        description: $t('dashboard.photos.messages.noStorageKey'),
        color: 'error',
      })
      return
    }

    const reprocessToast = toast.add({
      title: $t('dashboard.photos.messages.reprocessSuccess'),
      description: '',
      color: 'info',
    })

    const result = await $fetch('/api/queue/add-task', {
      method: 'POST',
      body: {
        payload: {
          type: 'photo',
          storageKey: photo.storageKey,
        },
        priority: 0,
        maxAttempts: 3,
      },
    })

    if (result.success) {
      toast.update(reprocessToast.id, {
        title: $t('dashboard.photos.messages.reprocessSuccess'),
        description: $t('dashboard.photos.messages.reprocessTaskId', {
          taskId: result.taskId,
        }),
        color: 'success',
      })
    } else {
      toast.update(reprocessToast.id, {
        title: $t('dashboard.photos.messages.error'),
        description: $t('dashboard.photos.messages.taskSubmitFailed'),
        color: 'error',
      })
    }
  } catch (error: any) {
    console.error('处理照片失败:', error)
    toast.add({
      title: $t('dashboard.photos.messages.reprocessFailed'),
      description: error.message || $t('dashboard.photos.messages.error'),
      color: 'error',
    })
  }
}

const getRowActions = (photo: Photo) => {
  const isReverseLoading = !!reverseGeocodeLoading.value[photo.id]
  const isEraseLocationLoading = !!eraseLocationLoading.value[photo.id]

  return [
    [
      {
        label: $t('dashboard.photos.actions.editMetadata'),
        icon: 'tabler:pencil',
        onSelect() {
          openMetadataEditor(photo)
        },
      },
      {
        label: $t('dashboard.photos.actions.reprocess'),
        icon: 'tabler:refresh',
        onSelect() {
          handleReprocessSingle(photo)
        },
      },
      {
        label: $t('dashboard.photos.actions.refreshLocation'),
        icon: isReverseLoading ? 'tabler:loader-2' : 'tabler:map-pin',
        disabled: isReverseLoading,
        onSelect() {
          handleReverseGeocodeRequest(photo)
        },
      },
      {
        label: $t('dashboard.photos.actions.eraseLocationInfo'),
        icon: isEraseLocationLoading ? 'tabler:loader-2' : 'tabler:map-off',
        disabled: isEraseLocationLoading,
        onSelect() {
          handleEraseLocationRequest(photo)
        },
      },
      {
        label: $t('dashboard.photos.actions.previewPhoto'),
        icon: 'tabler:photo',
        onSelect() {
          openImagePreview(photo)
        },
      },
    ],
    [
      {
        color: 'error',
        label: $t('dashboard.photos.actions.delete'),
        icon: 'tabler:trash',
        onSelect: () => handleSingleDeleteRequest(photo),
      },
    ],
  ]
}

// 图片预览弹窗
const isImagePreviewOpen = ref(false)
const previewingPhoto = ref<Photo | null>(null)

const openImagePreview = (photo: Photo) => {
  if (photo) {
    previewingPhoto.value = photo
    isImagePreviewOpen.value = true
  }
}

const openInNewTab = (url: string) => {
  if (typeof window !== 'undefined') {
    window.open(url, '_blank')
  }
}

const isDeleteConfirmOpen = ref(false)
const deleteMode = ref<'single' | 'batch'>('single')
const deleteTargetPhotos = ref<Photo[]>([])
const isDeleting = ref(false)

const openDeleteConfirm = (mode: 'single' | 'batch', photos: Photo[]) => {
  deleteMode.value = mode
  deleteTargetPhotos.value = photos
  isDeleteConfirmOpen.value = true
}

const handleSingleDeleteRequest = (photo: Photo) => {
  openDeleteConfirm('single', [photo])
}

// 批量删除功能
const handleBatchDelete = () => {
  const selectedPhotos = selectedPhotosList.value

  if (selectedPhotos.length === 0) {
    toast.add({
      title: $t('dashboard.photos.selection.selected', { count: 0, total: 0 }),
      description: $t('dashboard.photos.messages.batchSelectRequired'),
      color: 'warning',
    })
    return
  }

  openDeleteConfirm('batch', selectedPhotos)
}

const confirmDelete = async () => {
  if (deleteTargetPhotos.value.length === 0) {
    isDeleteConfirmOpen.value = false
    return
  }

  const mode = deleteMode.value
  const targetPhotos = [...deleteTargetPhotos.value]

  let deleteToast: ReturnType<typeof toast.add> | null = null

  isDeleting.value = true

  try {
    if (mode === 'batch') {
      deleteToast = toast.add({
        title: $t('dashboard.photos.delete.batch.title'),
        description: $t('dashboard.photos.messages.deleteSuccess'),
        color: 'info',
      })
      await Promise.all(
        targetPhotos.map((photo) =>
          $fetch(`/api/photos/${photo.id}`, {
            method: 'DELETE',
          }),
        ),
      )

      toast.update(deleteToast.id, {
        title: $t('dashboard.photos.messages.batchDeleteSuccess', {
          count: targetPhotos.length,
        }),
        description: '',
        color: 'success',
      })

      clearSelection()
    } else {
      const photo = targetPhotos[0]
      if (!photo) {
        throw new Error($t('dashboard.photos.messages.error'))
      }

      await $fetch(`/api/photos/${photo.id}`, {
        method: 'DELETE',
      })

      toast.add({
        title: $t('dashboard.photos.messages.deleteSuccess'),
        description: '',
        color: 'success',
      })
    }

    await refresh()
    isDeleteConfirmOpen.value = false
    deleteTargetPhotos.value = []
  } catch (error: any) {
    console.error('删除照片失败:', error)
    const message = error?.message || $t('dashboard.photos.messages.error')

    if (mode === 'batch' && deleteToast) {
      toast.update(deleteToast.id, {
        title: $t('dashboard.photos.messages.batchDeleteFailed'),
        description: message,
        color: 'error',
      })
    } else {
      toast.add({
        title: $t('dashboard.photos.messages.deleteFailed'),
        description: message,
        color: 'error',
      })
    }
  }

  isDeleting.value = false
}

// 批量重新处理照片功能
const handleBatchReprocess = async () => {
  const selectedPhotos = selectedPhotosList.value

  if (selectedPhotos.length === 0) {
    toast.add({
      title: $t('dashboard.photos.messages.batchSelectRequired'),
      description: '',
      color: 'warning',
    })
    return
  }

  // 检查所有选中照片是否都有 storageKey
  const photosWithStorageKey = selectedPhotos.filter(
    (photo: Photo) => photo.storageKey,
  )
  if (photosWithStorageKey.length !== selectedPhotos.length) {
    toast.add({
      title: $t('dashboard.photos.messages.error'),
      description: $t('dashboard.photos.messages.batchNoStorageKey', {
        count: selectedPhotos.length - photosWithStorageKey.length,
      }),
      color: 'error',
    })
    return
  }

  try {
    const reprocessToast = toast.add({
      title: $t('dashboard.photos.messages.batchReprocessing'),
      description: '',
      color: 'info',
    })

    const result = await $fetch('/api/queue/add-tasks', {
      method: 'POST',
      body: {
        tasks: photosWithStorageKey.map((photo: Photo) => ({
          payload: {
            type: 'photo',
            storageKey: photo.storageKey,
          },
          priority: 0,
          maxAttempts: 3,
        })),
      },
    })

    if (result.success) {
      toast.update(reprocessToast.id, {
        title: $t('dashboard.photos.messages.reprocessSuccess'),
        description: $t('dashboard.photos.messages.batchReprocessSuccess', {
          count: photosWithStorageKey.length,
        }),
        color: 'success',
      })
    } else {
      toast.update(reprocessToast.id, {
        title: $t('dashboard.photos.messages.error'),
        description: $t('dashboard.photos.messages.batchReprocessFailed'),
        color: 'error',
      })
    }

    // 清空选中状态
    clearSelection()
  } catch (error: any) {
    console.error('批量处理失败:', error)
    toast.add({
      title: $t('dashboard.photos.messages.batchReprocessFailed'),
      description: error.message || $t('dashboard.photos.messages.error'),
      color: 'error',
    })
  }
}

// 批量抹除位置信息
const handleBatchEraseLocation = async () => {
  const selectedPhotos = selectedPhotosList.value

  if (selectedPhotos.length === 0) {
    toast.add({
      title: $t('dashboard.photos.messages.batchSelectRequired'),
      description: '',
      color: 'warning',
    })
    return
  }

  const targetPhotoIds = selectedPhotos
    .map((photo: Photo) => photo.id)
    .filter((id): id is string => !!id)

  if (targetPhotoIds.length === 0) {
    toast.add({
      title: $t('dashboard.photos.messages.photoNotFound'),
      description: '',
      color: 'error',
    })
    return
  }

  for (const photoId of targetPhotoIds) {
    setEraseLocationLoading(photoId, true)
  }

  try {
    const result = await $fetch('/api/queue/add-tasks', {
      method: 'POST',
      body: {
        tasks: targetPhotoIds.map((photoId) => ({
          payload: {
            type: 'photo-erase-location',
            photoId,
          },
          priority: 2,
          maxAttempts: 3,
        })),
      },
    })

    if (result.success) {
      toast.add({
        title: $t('dashboard.photos.messages.batchEraseLocationQueued', {
          count: targetPhotoIds.length,
        }),
        description: '',
        color: 'success',
      })
      clearSelection()
    } else {
      toast.add({
        title: $t('dashboard.photos.messages.batchEraseLocationFailed'),
        description:
          result?.message ||
          $t('dashboard.photos.messages.batchEraseLocationFailed'),
        color: 'error',
      })
    }
  } catch (error: any) {
    console.error('批量抹除位置信息入队失败:', error)
    const message =
      error?.data?.statusMessage ||
      error?.statusMessage ||
      error?.message ||
      $t('dashboard.photos.messages.batchEraseLocationFailed')

    toast.add({
      title: $t('dashboard.photos.messages.batchEraseLocationFailed'),
      description: message,
      color: 'error',
    })
  } finally {
    for (const photoId of targetPhotoIds) {
      setEraseLocationLoading(photoId, false)
    }
  }
}

// 批量下载照片
const handleBatchDownload = async () => {
  const selectedPhotos = selectedPhotosList.value

  if (selectedPhotos.length === 0) {
    toast.add({
      title: $t('dashboard.photos.messages.batchSelectRequired'),
      description: '',
      color: 'warning',
    })
    return
  }

  // 检查所有选中照片是否都有 originalUrl
  const photosWithUrl = selectedPhotos.filter(
    (photo: Photo) => photo.originalUrl,
  )
  if (photosWithUrl.length === 0) {
    toast.add({
      title: $t('dashboard.photos.messages.error'),
      description: $t('dashboard.photos.messages.batchNoUrl'),
      color: 'error',
    })
    return
  }

  if (photosWithUrl.length !== selectedPhotos.length) {
    toast.add({
      title: $t('dashboard.photos.messages.warning'),
      description: $t('dashboard.photos.messages.batchPartialUrl', {
        count: photosWithUrl.length,
        total: selectedPhotos.length,
      }),
      color: 'warning',
    })
  }

  const downloadToast = toast.add({
    title: $t('dashboard.photos.messages.downloadStarted'),
    description: $t('dashboard.photos.messages.downloadingCount', {
      count: photosWithUrl.length,
    }),
    color: 'info',
  })

  let successCount = 0
  let failureCount = 0

  try {
    for (const photo of photosWithUrl) {
      try {
        const response = await fetch(photo.originalUrl!)
        if (!response.ok) {
          failureCount++
          continue
        }

        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        const extension = photo.originalUrl!.split('.').pop() || 'jpg'
        link.download = `${photo.title || `photo-${photo.id}`}.${extension}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        successCount++

        // 为了避免浏览器限制，每个下载之间加入短延迟
        await new Promise((resolve) => setTimeout(resolve, 200))
      } catch (error) {
        console.error(`Failed to download photo ${photo.id}:`, error)
        failureCount++
      }
    }

    // 更新提示信息
    if (successCount === photosWithUrl.length) {
      toast.update(downloadToast.id, {
        title: $t('dashboard.photos.messages.batchDownloadSuccess'),
        description: $t('dashboard.photos.messages.downloadedCount', {
          count: successCount,
        }),
        color: 'success',
      })
    } else if (failureCount === photosWithUrl.length) {
      toast.update(downloadToast.id, {
        title: $t('dashboard.photos.messages.batchDownloadFailed'),
        description: $t('dashboard.photos.messages.downloadFailedCount', {
          count: failureCount,
        }),
        color: 'error',
      })
    } else {
      toast.update(downloadToast.id, {
        title: $t('dashboard.photos.messages.batchDownloadPartial'),
        description: $t('dashboard.photos.messages.downloadPartialCount', {
          success: successCount,
          failed: failureCount,
        }),
        color: 'warning',
      })
    }
  } catch (error: any) {
    console.error('批量下载出错:', error)
    toast.update(downloadToast.id, {
      title: $t('dashboard.photos.messages.error'),
      description: error.message || $t('dashboard.photos.messages.error'),
      color: 'error',
    })
  }
}

watch(isImagePreviewOpen, (open) => {
  if (!open) {
    previewingPhoto.value = null
  }
})

// 清理定时器
onUnmounted(() => {
  // 清理所有状态检查定时器
  statusIntervals.value.forEach((intervalId) => {
    clearInterval(intervalId)
  })
  statusIntervals.value.clear()
})
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('dashboard.photos.toolbar.title')">
        <template #right>
          <div class="flex gap-2 items-center">
            <UButton
              variant="soft"
              color="neutral"
              icon="tabler:list-check"
              @click="$router.push('/dashboard/queue')"
            >
              <span class="hidden sm:inline">{{
                $t('dashboard.photos.buttons.queue')
              }}</span>
            </UButton>
            <UButton
              icon="tabler:cloud-upload"
              @click="openUploadSlideover"
            >
              <span class="hidden sm:inline">{{
                $t('dashboard.photos.buttons.upload')
              }}</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 h-full flex-1 min-h-0">
        <!-- 上传队列容器 -->
        <UploadQueuePanel
          :uploading-files="uploadingFiles"
          @remove-file="removeUploadingFile"
          @clear-completed="clearCompletedUploads"
          @clear-all="clearAllUploads"
          @go-to-queue="$router.push('/dashboard/queue')"
          class="shrink-0"
        />

        <USlideover
          v-model:open="isUploadSlideoverOpen"
          :title="$t('dashboard.photos.slideover.title')"
          :description="$t('dashboard.photos.slideover.description')"
          :ui="{
            content: 'sm:max-w-xl',
            body: 'p-2',
            header:
              'px-6 py-5 border-b border-(--ui-border)',
            footer:
              'px-6 py-5 border-t border-(--ui-border)',
          }"
        >
          <template #body>
            <div class="space-y-4">
              <UFileUpload
                v-model="selectedFiles"
                :label="$t('dashboard.photos.uploader.label')"
                :description="
                  $t('dashboard.photos.uploader.description', {
                    maxSize: maxFileSizeMB,
                  })
                "
                icon="tabler:cloud-upload"
                layout="list"
                size="xl"
                accept="image/jpeg,image/png,image/heic,image/heif,video/quicktime,.mov"
                multiple
                highlight
                dropzone
                :file-delete="{ variant: 'soft', color: 'neutral' }"
                :ui="{
                  root: 'w-full',
                  base: 'group relative flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-(--ui-border-accented) bg-(--ui-bg-accented) px-6 py-12 text-center shadow-sm transition-all duration-300 hover:border-(--ui-text-muted) hover:bg-(--ui-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ui-text)/60',
                  wrapper: 'flex flex-col items-center gap-2',
                  label: 'text-base font-semibold text-(--ui-text)',
                  description: 'text-sm text-(--ui-text-muted)',
                  files: 'mt-2 flex w-full flex-col gap-2 overflow-y-auto',
                  file: 'flex items-center justify-between gap-3 rounded-2xl border border-(--ui-border-accented) bg-(--ui-bg-elevated) px-4 py-3 text-left shadow-sm shadow-black/5 backdrop-blur-sm',
                  fileLeadingAvatar: 'ring-1 ring-(--ui-border)',
                  fileWrapper: 'min-w-0 flex-1',
                  fileName: 'text-sm font-medium text-(--ui-text) truncate',
                  fileSize: 'text-xs text-(--ui-text-muted)',
                  fileTrailingButton: 'text-(--ui-text-dimmed) hover:text-error-500',
                }"
              />

              <!-- 上传位置选择：本地存储 / 外部扫描库 -->
              <UCard
                variant="soft"
                class="border-(--ui-border-accented)"
              >
                <div class="space-y-3">
                  <div class="space-y-1">
                    <p
                      class="text-sm font-medium text-(--ui-text)"
                    >
                      {{
                        $t(
                          'dashboard.photos.slideover.options.uploadTarget.label',
                        )
                      }}
                    </p>
                    <p
                      class="text-xs text-(--ui-text-muted)"
                    >
                      {{
                        $t(
                          'dashboard.photos.slideover.options.uploadTarget.description',
                        )
                      }}
                    </p>
                  </div>
                  <div class="grid gap-2">
                    <button
                      type="button"
                      class="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
                      :class="
                        uploadTarget === 'storage'
                          ? 'border-(--ui-text) bg-(--ui-text)/8'
                          : 'border-(--ui-border) bg-(--ui-bg-accented) hover:border-(--ui-border-accented)'
                      "
                      @click="uploadTarget = 'storage'"
                    >
                      <span class="flex size-5 items-center justify-center">
                        <span
                          class="size-4 rounded-full border-2"
                          :class="
                            uploadTarget === 'storage'
                              ? 'border-(--ui-text) bg-(--ui-text)'
                              : 'border-(--ui-border-accented)'
                          "
                        />
                      </span>
                      <UIcon
                        name="tabler:database"
                        class="size-4.5 shrink-0 text-(--ui-text-muted)"
                      />
                      <span class="min-w-0">
                        <span
                          class="block text-sm font-medium text-(--ui-text)"
                        >
                          {{
                            $t(
                              'dashboard.photos.slideover.options.uploadTarget.localStorage',
                            )
                          }}
                        </span>
                        <span
                          class="block text-xs text-(--ui-text-muted)"
                        >
                          {{
                            $t(
                              'dashboard.photos.slideover.options.uploadTarget.defaultHint',
                            )
                          }}
                        </span>
                      </span>
                    </button>

                    <button
                      v-for="lib in enabledUploadLibraries"
                      :key="lib.id"
                      type="button"
                      class="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
                      :class="
                        uploadTarget === lib.id
                          ? 'border-(--ui-text) bg-(--ui-text)/8'
                          : 'border-(--ui-border) bg-(--ui-bg-accented) hover:border-(--ui-border-accented)'
                      "
                      @click="uploadTarget = lib.id"
                    >
                      <span class="flex size-5 items-center justify-center">
                        <span
                          class="size-4 rounded-full border-2"
                          :class="
                            uploadTarget === lib.id
                              ? 'border-(--ui-text) bg-(--ui-text)'
                              : 'border-(--ui-border-accented)'
                          "
                        />
                      </span>
                      <UIcon
                        name="tabler:folder-open"
                        class="size-4.5 shrink-0 text-(--ui-text-muted)"
                      />
                      <span class="min-w-0">
                        <span
                          class="block truncate text-sm font-medium text-(--ui-text)"
                        >
                          {{ lib.name }}
                        </span>
                      </span>
                    </button>
                  </div>
                </div>
              </UCard>

              <UCard
                variant="soft"
                class="border-(--ui-border-accented)"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="space-y-1">
                    <p
                      class="text-sm font-medium text-(--ui-text)"
                    >
                      {{
                        $t(
                          'dashboard.photos.slideover.options.eraseLocation.label',
                        )
                      }}
                    </p>
                    <p class="text-xs text-(--ui-text-muted)">
                      {{
                        $t(
                          'dashboard.photos.slideover.options.eraseLocation.description',
                        )
                      }}
                    </p>
                  </div>
                  <USwitch v-model="uploadEraseLocationEnabled" />
                </div>
              </UCard>
            </div>
          </template>

          <template #footer>
            <div
              class="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div
                class="flex flex-col gap-1 text-sm text-neutral-500 dark:text-neutral-400"
              >
                <span>{{
                  hasSelectedFiles
                    ? selectedFilesSummary
                    : $t('dashboard.photos.slideover.footer.noSelection')
                }}</span>
              </div>
              <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <UButton
                  variant="soft"
                  color="neutral"
                  class="w-full sm:w-auto"
                  :disabled="!hasSelectedFiles"
                  @click="clearSelectedFiles"
                >
                  {{ $t('dashboard.photos.slideover.buttons.clear') }}
                </UButton>
                <UButton
                  color="primary"
                  size="lg"
                  class="w-full sm:w-auto"
                  icon="tabler:upload"
                  :disabled="!hasSelectedFiles"
                  @click="handleUpload"
                >
                  {{
                    hasSelectedFiles
                      ? $t('dashboard.photos.slideover.buttons.upload', {
                          count: selectedFiles.length,
                        })
                      : $t('dashboard.photos.buttons.upload')
                  }}
                </UButton>
              </div>
            </div>
          </template>
        </USlideover>

        <!-- 统合容器：工具栏 + 照片列表 -->
        <div
          class="relative flex-1 min-h-0 flex flex-col bg-(--ui-bg) border border-(--ui-border) rounded-2xl shadow-sm overflow-hidden"
        >
          <!-- 工具栏 -->
          <div
            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:px-4 sm:py-3 bg-(--ui-bg-muted) backdrop-blur-sm border-b border-(--ui-border) z-20"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-8 items-center justify-center rounded-[10px] bg-(--ui-bg-accented) border border-(--ui-border)"
              >
                <UIcon
                  name="tabler:photo"
                  class="size-4.5 text-(--ui-text-toned)"
                />
              </div>
              <span
                class="font-semibold text-sm text-(--ui-text) hidden sm:inline"
              >
                {{ $t('dashboard.photos.toolbar.title') }}
              </span>
              <div class="flex items-center gap-1 sm:gap-2 sm:ml-1">
              <UBadge
                v-if="livePhotoStats.staticPhotos > 0"
                variant="soft"
                color="neutral"
                size="sm"
              >
                <span class="hidden sm:inline"
                  >{{ livePhotoStats.staticPhotos }}
                  {{ $t('dashboard.photos.stats.photos') }}</span
                >
                <span class="sm:hidden"
                  >{{ livePhotoStats.staticPhotos }}P</span
                >
              </UBadge>
              <UBadge
                v-if="livePhotoStats.livePhotos > 0"
                variant="soft"
                color="warning"
                size="sm"
              >
                <span class="hidden sm:inline"
                  >{{ livePhotoStats.livePhotos }}
                  {{ $t('dashboard.photos.stats.livePhotos') }}</span
                >
                <span class="sm:hidden">{{ livePhotoStats.livePhotos }}LP</span>
              </UBadge>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <UPopover>
              <UTooltip :text="$t('ui.action.filter.tooltip')">
                <UChip
                  inset
                  size="sm"
                  color="info"
                  :show="totalSelectedFilters > 0"
                >
                  <UButton
                    variant="soft"
                    :color="hasActiveFilters ? 'info' : 'neutral'"
                    class="bg-transparent rounded-full cursor-pointer relative"
                    icon="tabler:filter"
                    size="sm"
                  />
                </UChip>
              </UTooltip>

              <template #content>
                <UCard variant="glassmorphism">
                  <OverlayFilterPanel />
                </UCard>
              </template>
            </UPopover>
            <!-- 过滤器 -->
            <USelectMenu
              v-model="photoFilter"
              class="w-full sm:w-48"
              :items="[
                {
                  label: $t('dashboard.photos.photoFilter.all'),
                  value: 'all',
                  icon: 'tabler:photo-scan',
                },
                {
                  label: $t('dashboard.photos.photoFilter.livephoto'),
                  value: 'livephoto',
                  icon: 'tabler:live-photo',
                },
                {
                  label: $t('dashboard.photos.photoFilter.static'),
                  value: 'static',
                  icon: 'tabler:photo',
                },
              ]"
              value-key="value"
              label-key="label"
              size="sm"
            >
            </USelectMenu>

            <!-- 刷新按钮 -->
            <UButton
              variant="soft"
              color="info"
              size="sm"
              icon="tabler:refresh"
              :loading="reactionsLoading"
              @click="
                async () => {
                  await refresh()
                  if (filteredData.length > 0) {
                    await fetchReactions(filteredData.map((p: Photo) => p.id))
                  }
                }
              "
            >
              <span class="hidden sm:inline">{{
                $t('dashboard.photos.toolbar.refresh')
              }}</span>
            </UButton>

            <!-- 选择模式：进入后才显示照片上的方形选择框 -->
            <UButton
              :variant="isSelectionMode ? 'solid' : 'soft'"
              :color="isSelectionMode ? 'primary' : 'neutral'"
              size="sm"
              :icon="isSelectionMode ? 'tabler:x' : 'tabler:checkbox'"
              @click="toggleSelectionMode"
            >
              <span class="hidden sm:inline">{{ selectModeLabel }}</span>
            </UButton>

            <!-- 全选当前筛选列表 -->
            <UButton
              variant="soft"
              color="neutral"
              size="sm"
              icon="tabler:select"
              :disabled="!isSelectionMode || filteredData.length === 0"
              @click="selectAllVisiblePhotos()"
            >
              <span class="hidden sm:inline">{{
                $t('dashboard.photos.table.selectAllAria')
              }}</span>
            </UButton>
          </div>
        </div>

        <!-- 照片列表：高度受面板约束，内部滚动 -->
        <div
          ref="masonryScrollContainerRef"
          class="relative flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth"
        >
          <MasonryWall
            :items="masonryItems"
            :column-width="236"
            :gap="10"
            :min-columns="2"
            :max-columns="8"
            :ssr-columns="2"
            :key-mapper="
              (_item, _column, _row, index) =>
                masonryItems[index]?.originalIndex ?? index
            "
            class="p-2 sm:p-3"
          >
            <template #default="{ item }">
              <div
                v-if="item.photo"
                :key="item.photo.id"
                class="group relative overflow-hidden rounded-xl border border-(--ui-border) bg-(--ui-bg-elevated) shadow-sm cursor-pointer"
                @click="
                  isSelectionMode
                    ? togglePhotoSelection(item.photo)
                    : openImagePreview(item.photo)
                "
              >
                <ThumbImage
                  :src="item.photo.thumbnailUrl || item.photo.originalUrl || ''"
                  :alt="item.photo.title || ''"
                  :thumbhash="item.photo.thumbnailHash || ''"
                  class="block w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  :style="aspectStyle(item.photo)"
                />

                <!-- 选中标记：仅在选择模式下显示 -->
                <button
                  v-if="isSelectionMode"
                  type="button"
                  class="absolute left-2 top-2 flex size-6 items-center justify-center rounded-lg border backdrop-blur-md transition-colors"
                  :class="
                    isPhotoSelected(item.photo.id)
                      ? 'border-primary bg-primary/90 text-white'
                      : 'border-(--ui-border-accented) bg-black/35 text-white hover:bg-black/55'
                  "
                  :aria-label="$t('dashboard.photos.table.selectRowAria')"
                  @click.stop="togglePhotoSelection(item.photo)"
                >
                  <Icon
                    v-if="isPhotoSelected(item.photo.id)"
                    name="tabler:check"
                    class="size-4"
                  />
                </button>

                <!-- 鼠标悬停操作菜单（编辑 / 重新处理 / 定位 / 预览 / 删除） -->
                <div
                  class="absolute right-2 top-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                >
                  <UDropdownMenu
                    size="sm"
                    :content="{ align: 'end' }"
                    :items="getRowActions(item.photo)"
                  >
                    <UButton
                      variant="solid"
                      color="neutral"
                      size="sm"
                      icon="tabler:dots-vertical"
                      @click.stop
                    />
                  </UDropdownMenu>
                </div>

                <!-- LivePhoto 标记 -->
                <div
                  v-if="item.photo.isLivePhoto"
                  class="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/45 backdrop-blur-md px-1.5 py-0.5"
                >
                  <Icon
                    name="tabler:live-photo"
                    class="size-3.5 text-yellow-300"
                  />
                </div>
              </div>
            </template>
          </MasonryWall>

          <!-- 增量渲染哨兵：滚动接近底部时追加下一批照片 -->
          <div
            v-if="masonryRenderedCount < (filteredData?.length ?? 0)"
            ref="masonrySentinelRef"
            class="h-px w-full"
            aria-hidden="true"
          />

          <!-- 悬浮版批量操作菜单 -->
          <transition
            enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="translate-y-8 opacity-0 scale-95"
            enter-to-class="translate-y-0 opacity-100 scale-100"
            leave-active-class="transition-all duration-200 ease-in"
            leave-from-class="translate-y-0 opacity-100 scale-100"
            leave-to-class="translate-y-8 opacity-0 scale-95"
          >
            <div
              v-if="isSelectionMode && selectedRowsCount > 0"
              class="fixed bottom-8 left-1/2 -translate-x-1/2 px-2 py-1.5 bg-(--ui-bg-elevated) backdrop-blur-xl shadow-xl rounded-full border border-(--ui-border-accented) z-60 flex items-center gap-3 sm:gap-6 shadow-black/5 dark:shadow-black/20"
            >
              <div
                class="pl-4 pr-1 border-r border-(--ui-border) min-w-max"
              >
                <p
                  class="text-sm font-medium tracking-wide text-(--ui-text)"
                >
                  {{
                    $t('dashboard.photos.selection.selected', {
                      count: selectedRowsCount,
                      total: totalRowsCount,
                    })
                  }}
                </p>
              </div>

              <div class="flex items-center gap-1 sm:gap-1.5 pr-2">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  class="rounded-full text-(--ui-text-muted) hover:text-(--ui-text-highlighted) hover:bg-(--ui-bg)"
                  icon="tabler:refresh"
                  @click="handleBatchReprocess"
                >
                  <span class="hidden sm:inline">{{
                    $t('dashboard.photos.selection.batchReprocess')
                  }}</span>
                </UButton>

                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  class="rounded-full text-(--ui-text-muted) hover:text-(--ui-text-highlighted) hover:bg-(--ui-bg)"
                  icon="tabler:map-off"
                  @click="handleBatchEraseLocation"
                >
                  <span class="hidden sm:inline">{{
                    $t('dashboard.photos.selection.batchEraseLocation')
                  }}</span>
                </UButton>

                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  class="rounded-full text-(--ui-text-muted) hover:text-(--ui-text-highlighted) hover:bg-(--ui-bg)"
                  icon="tabler:download"
                  @click="handleBatchDownload"
                >
                  <span class="hidden sm:inline">{{
                    $t('dashboard.photos.selection.batchDownload')
                  }}</span>
                </UButton>

                <UButton
                  color="error"
                  variant="ghost"
                  size="sm"
                  class="rounded-full hover:bg-error-50 dark:hover:bg-error-500/20"
                  icon="tabler:trash"
                  @click="handleBatchDelete"
                >
                  <span class="hidden sm:inline">{{
                    $t('dashboard.photos.selection.batchDelete')
                  }}</span>
                </UButton>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <USlideover
          v-model:open="isEditModalOpen"
          :title="$t('dashboard.photos.editModal.title')"
          :description="$t('dashboard.photos.editModal.description')"
          :ui="{
            content: 'sm:max-w-xl',
            body: 'p-2',
            header:
              'px-6 py-5 border-b border-(--ui-border)',
            footer:
              'px-6 py-5 border-t border-(--ui-border)',
          }"
        >
          <template #body>
            <div class="space-y-6">
              <div
                v-if="editingPhoto"
                class="space-y-1"
              >
                <p class="text-xs text-(--ui-text-muted)">
                  {{ editingPhoto.title || editingPhoto.id }}
                </p>
              </div>

              <UForm
                id="edit-photo-form"
                :state="editFormState"
                class="space-y-5"
                @submit="handleEditSubmit"
              >
                <UFormField
                  :label="$t('dashboard.photos.editModal.fields.title')"
                  name="title"
                >
                  <UInput
                    v-model="editFormState.title"
                    class="w-full"
                  />
                </UFormField>

                <UFormField
                  :label="$t('dashboard.photos.editModal.fields.description')"
                  name="description"
                >
                  <UTextarea
                    v-model="editFormState.description"
                    :rows="3"
                    class="w-full"
                  />
                </UFormField>

                <div class="space-y-2">
                  <UFormField
                    :label="$t('dashboard.photos.editModal.fields.tags')"
                    name="tags"
                  >
                    <UInputTags
                      v-model="tagsModel"
                      class="w-full"
                    />
                  </UFormField>
                  <p class="text-xs text-neutral-500 dark:text-neutral-400">
                    {{ $t('dashboard.photos.editModal.fields.tagsHint') }}
                  </p>
                </div>

                <div class="flex items-center justify-between space-y-2">
                  <label
                    class="text-sm font-medium text-neutral-700 dark:text-neutral-200"
                  >
                    {{ $t('dashboard.photos.editModal.fields.rating') }}
                  </label>
                  <div class="flex items-center gap-3">
                    <span
                      v-if="editFormState.rating"
                      class="text-sm text-neutral-600 dark:text-neutral-400"
                    >
                      {{ editFormState.rating }} / 5
                    </span>
                    <span
                      v-else
                      class="text-sm text-neutral-500 dark:text-neutral-500"
                    >
                      {{ $t('dashboard.photos.editModal.fields.noRating') }}
                    </span>
                    <Rating
                      :model-value="editFormState.rating || 0"
                      :allow-half="false"
                      size="lg"
                      @update:model-value="
                        editFormState.rating = $event || null
                      "
                    />
                  </div>
                </div>

                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <label
                      class="text-sm font-medium text-neutral-700 dark:text-neutral-200"
                    >
                      {{ $t('dashboard.photos.editModal.fields.location') }}
                    </label>
                    <UButton
                      v-if="locationSelection"
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      icon="tabler:map-off"
                      @click.prevent="clearSelectedLocation"
                    >
                      {{
                        $t('dashboard.photos.editModal.fields.clearLocation')
                      }}
                    </UButton>
                  </div>

                  <MapLocationPicker
                    v-model="locationSelection"
                    class="border border-neutral-200 dark:border-neutral-800"
                    @pick="handleLocationPick"
                  >
                    <template #empty>
                      <span
                        class="px-3 py-2 rounded-full bg-(--ui-bg-accented) text-(--ui-text-muted) shadow border border-(--ui-border)"
                      >
                        {{
                          $t('dashboard.photos.editModal.fields.locationHint')
                        }}
                      </span>
                    </template>
                  </MapLocationPicker>

                  <div
                    class="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2"
                  >
                    <span
                      >{{
                        $t('dashboard.photos.editModal.fields.coordinates')
                      }}:</span
                    >
                    <span v-if="formattedCoordinates">
                      {{ formattedCoordinates.latitude }},
                      {{ formattedCoordinates.longitude }}
                    </span>
                    <span v-else>
                      {{ $t('dashboard.photos.editModal.fields.noLocation') }}
                    </span>
                  </div>
                </div>
              </UForm>
            </div>
          </template>

          <template #footer>
            <div class="flex items-center justify-end gap-2 w-full">
              <UButton
                variant="ghost"
                color="neutral"
                @click.prevent="isEditModalOpen = false"
              >
                {{ $t('dashboard.photos.editModal.actions.cancel') }}
              </UButton>
              <UButton
                type="submit"
                form="edit-photo-form"
                :loading="isSavingMetadata"
                :disabled="!isMetadataDirty || isSavingMetadata"
                icon="tabler:device-floppy"
              >
                {{ $t('dashboard.photos.editModal.actions.save') }}
              </UButton>
            </div>
          </template>
        </USlideover>

        <UModal v-model:open="isDeleteConfirmOpen">
          <template #body>
            <div class="space-y-4">
              <div class="flex items-start gap-4">
                <div
                  class="flex size-10 items-center justify-center rounded-full bg-error-100 dark:bg-error-900/40 text-error-600 dark:text-error-400 shrink-0"
                >
                  <Icon
                    name="tabler:trash"
                    class="size-6"
                  />
                </div>
                <div class="space-y-1.5 pt-1">
                  <h3
                    class="text-lg font-semibold text-neutral-900 dark:text-white leading-5"
                  >
                    {{
                      deleteMode === 'single'
                        ? $t('dashboard.photos.delete.single.title')
                        : $t('dashboard.photos.delete.batch.title')
                    }}
                  </h3>
                  <p
                    class="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed"
                  >
                    {{
                      deleteMode === 'single'
                        ? $t('dashboard.photos.delete.single.message')
                        : $t('dashboard.photos.delete.batch.message', {
                            count: deleteTargetPhotos.length,
                          })
                    }}
                  </p>
                  <div
                    class="mt-4 p-3 bg-error-50 dark:bg-error-500/10 border border-error-200/50 dark:border-error-500/20 rounded-lg"
                  >
                    <p
                      class="text-sm font-medium text-error-600 dark:text-error-400 flex items-center gap-2"
                    >
                      <Icon
                        name="tabler:alert-triangle-filled"
                        class="size-4"
                      />
                      {{ $t('dashboard.photos.delete.warning') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <template #footer>
            <div class="flex justify-end gap-3 w-full">
              <UButton
                variant="ghost"
                color="neutral"
                :disabled="isDeleting"
                @click="isDeleteConfirmOpen = false"
              >
                {{ $t('dashboard.photos.delete.buttons.cancel') }}
              </UButton>
              <UButton
                color="error"
                icon="tabler:trash"
                :loading="isDeleting"
                @click="confirmDelete"
              >
                {{ $t('dashboard.photos.delete.buttons.confirm') }}
              </UButton>
            </div>
          </template>
        </UModal>

        <!-- 图片预览模态框 -->
        <UModal
          v-model:open="isImagePreviewOpen"
          :title="$t('dashboard.photos.previewTitle')"
          :description="previewingPhoto?.description || ''"
        >
          <template #body>
            <div
              class="flex items-center justify-center w-full"
              style="max-height: calc(100vh - 12rem)"
            >
              <div class="w-full max-w-2xl rounded-lg overflow-hidden">
                <MasonryItemPhoto
                  v-if="previewingPhoto"
                  :photo="previewingPhoto"
                  :index="0"
                  @visibility-change="() => {}"
                  @open-viewer="openInNewTab(`/${previewingPhoto.id}`)"
                />
              </div>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
