<script setup lang="ts">
import { motion, AnimatePresence, useDomRef } from 'motion-v'
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Navigation, Keyboard, Virtual } from 'swiper/modules'
import type { Swiper as SwiperType } from 'swiper'

import 'swiper/swiper-bundle.css'

import LoadingIndicator from './LoadingIndicator.vue'
import ProgressiveImage from './ProgressiveImage.vue'
import GalleryThumbnail from './GalleryThumbnail.vue'
import InfoPanel from './InfoPanel.vue'
import ReactionPicker from './ReactionPicker.vue'
import ReactionConfetti from './ReactionConfetti.vue'
import { REACTION_ICON_MAP } from './reaction-definitions'
import type { LoadingIndicatorRef } from './LoadingIndicator.vue'
import { ImageLoaderManager } from '~/libs/image-loader-manager'

interface Props {
  photos: Photo[]
  currentIndex: number
  isOpen: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  indexChange: [index: number]
}>()

const toast = useToast()

const containerRef = ref<HTMLDivElement>()
const swiperRef = ref<SwiperType>()
const loadingIndicatorRef = ref<LoadingIndicatorRef>()

const isImageZoomed = ref(false)
// 当前图片纹理（WebGL）构建成功标志：只有构建完成才显示表态按钮等附属控件
const currentTextureReady = ref(false)
const showExifPanel = ref(false)
const showShareModal = ref(false)
const currentBlobSrc = ref<string | null>(null)
const zoomLevel = ref(0)
const showZoomLevel = ref(false)
const zoomLevelTimer = ref<NodeJS.Timeout | null>(null)

const showReactionPicker = ref(false)
const reactionButtonRef = ref<HTMLButtonElement | null>(null)
const shouldCloseReactionPickerOnClick = ref(false)
const selectedReaction = ref<string | null>(null)
const reactionCounts = ref<Record<string, number>>({})
const isLoadingReaction = ref(false)
const confettiIcon = ref<string | null>(null)
const confettiTriggerCount = ref(0)

const currentReactionIcon = computed(() => {
  const reactionId = selectedReaction.value
  if (!reactionId) return null
  return REACTION_ICON_MAP[reactionId as keyof typeof REACTION_ICON_MAP] || null
})

// 计算总表态数
const totalReactions = computed(() => {
  return Object.values(reactionCounts.value).reduce(
    (sum, count) => sum + count,
    0,
  )
})

// 加载照片表态数据
const loadPhotoReactions = async (photoId: string) => {
  try {
    const data = (await $fetch(`/api/photos/${photoId}/reactions`)) as any
    selectedReaction.value = data.userReaction || null
    reactionCounts.value = data.reactions || {}
  } catch (error) {
    console.error('Failed to load reactions:', error)
  }
}

// LivePhoto state
const isLivePhotoHovering = ref(false)
const isLivePhotoPlaying = ref(false)
const isLivePhotoTouching = ref(false)
const isLivePhotoMuted = ref(true)
const touchCount = ref(0)
const livePhotoVideoBlob = ref<Blob | null>(null)
const livePhotoVideoBlobUrl = ref<string | null>(null)
const livePhotoVideoRef = useDomRef()
const longPressTimer = ref<NodeJS.Timeout | null>(null)

// Import LivePhoto processor
const { convertMovToMp4, getProcessingState } = useLivePhotoProcessor()

// Computed
const currentPhoto = computed(() => props.photos[props.currentIndex])
const isMobile = useMediaQuery('(max-width: 768px)')

// 桌面端底部缩略图导航栏高度（lg：48px 缩略图 + 12px×2 内边距 + 1px 顶边框 = 73px）。
// 非隐藏状态给图片舞台预留该底部空间，让主图显示区域在底栏上方收口，
// 清晰照片不会延伸到透明模糊底栏的下一层。
const THUMBNAIL_BAR_HEIGHT = '73px'

// 底部导航栏隐藏条件：桌面端进入放大（平移/缩放）或信息侧栏展开时自动收起；
// 移动端打开图片信息卡片(showExifPanel 底部弹层)时同样自动收起。隐藏的同时
// 释放预留的底部空间，让图片可用全高。
const isBottomNavHidden = computed(
  () =>
    (isMobile.value && showExifPanel.value) ||
    (!isMobile.value &&
      (isImageZoomed.value || isDesktopInspectorVisible.value)),
)
const thumbBarBottomPad = computed(() =>
  isBottomNavHidden.value ? '0px' : THUMBNAIL_BAR_HEIGHT,
)

// 背景模糊图就绪门控：切换图片时先隐藏，@load 后再平滑淡入，避免"黑屏闪断"
const blurReady = ref(false)
watch(
  () => currentPhoto.value?.thumbnailUrl,
  () => {
    blurReady.value = false
  },
)

// 渐进式预解码：当前图加载的同时，静默预取上一张/下一张的全尺寸图进 Blob 缓存，
// 用户前后切换时直接命中缓存（Blob URL 已被 WebGL 消费，不再联网重新下载）
const prefetchManager = new ImageLoaderManager()
const prefetchNearby = () => {
  const targets = [
    props.photos[props.currentIndex - 1],
    props.photos[props.currentIndex + 1],
  ].filter((p): p is Photo => Boolean(p))
  for (const photo of targets) {
    if (photo.type === 'video') continue
    if (photo.originalUrl) prefetchManager.prefetch(photo.originalUrl)
  }
}
watch(() => props.currentIndex, prefetchNearby)
onMounted(prefetchNearby)

// LivePhoto processing state
const livePhotoProcessingState = computed(() => {
  return currentPhoto.value
    ? getProcessingState(currentPhoto.value.id)
    : ref(null)
})

// 当 PhotoViewer 关闭时重置状态
watch(
  () => props.isOpen,
  (isOpen) => {
    if (!isOpen) {
      isImageZoomed.value = false
      showExifPanel.value = false
      showShareModal.value = false
      currentBlobSrc.value = null
      currentTextureReady.value = false
      zoomLevel.value = 0
      showZoomLevel.value = false

      // Reset reaction state
      showReactionPicker.value = false
      selectedReaction.value = null
      confettiIcon.value = null
      confettiTriggerCount.value = 0

      // Reset LivePhoto state
      isLivePhotoHovering.value = false
      isLivePhotoPlaying.value = false
      isLivePhotoTouching.value = false
      touchCount.value = 0
      if (longPressTimer.value) {
        clearTimeout(longPressTimer.value)
        longPressTimer.value = null
      }
      if (livePhotoVideoBlobUrl.value) {
        URL.revokeObjectURL(livePhotoVideoBlobUrl.value)
        livePhotoVideoBlobUrl.value = null
      }
      livePhotoVideoBlob.value = null

      if (zoomLevelTimer.value) {
        clearTimeout(zoomLevelTimer.value)
        zoomLevelTimer.value = null
      }
      // TODO: 实现自定义的 ScrollArea 后移除
      document.body.style.overflow = ''
    } else {
      document.body.style.overflow = 'hidden'
      // Process current LivePhoto when viewer opens
      nextTick(() => {
        processCurrentLivePhoto()
      })
    }
  },
  { immediate: true },
)

// 同步 Swiper 的索引
watch(
  () => props.currentIndex,
  (newIndex) => {
    if (swiperRef.value && swiperRef.value.activeIndex !== newIndex) {
      swiperRef.value.slideTo(newIndex, 300)
    }
    // 切换图片时重置缩放状态
    isImageZoomed.value = false
    zoomLevel.value = 0
    currentTextureReady.value = false

    // Reset reaction state when switching photos
    showReactionPicker.value = false
    selectedReaction.value = null

    // Reset LivePhoto state when switching photos
    isLivePhotoPlaying.value = false
    isLivePhotoHovering.value = false
    isLivePhotoTouching.value = false
    touchCount.value = 0
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value)
      longPressTimer.value = null
    }

    // Process new current LivePhoto
    nextTick(() => {
      processCurrentLivePhoto()
    })
  },
)

// 当图片缩放状态改变时，控制 Swiper 的触摸行为
watch(isImageZoomed, (isZoomed) => {
  if (swiperRef.value) {
    swiperRef.value.allowTouchMove = !isZoomed
  }
})

// Navigation methods
const handlePrevious = () => {
  if (props.currentIndex > 0) {
    emit('indexChange', props.currentIndex - 1)
    swiperRef.value?.slidePrev()
  }
}

const handleNext = () => {
  if (props.currentIndex < props.photos.length - 1) {
    emit('indexChange', props.currentIndex + 1)
    swiperRef.value?.slideNext()
  }
}

// Handle Swiper events
const handleSwiperInit = (swiper: SwiperType) => {
  swiperRef.value = swiper
  swiper.allowTouchMove = !isImageZoomed.value
}

const handleSlideChange = (swiper: SwiperType) => {
  emit('indexChange', swiper.activeIndex)
}

// Handle image events
const handleZoomChange = (isZoomed: boolean, level?: number) => {
  isImageZoomed.value = isZoomed
  if (level !== undefined) {
    zoomLevel.value = level
    // 缩放变化时显示缩放倍率 2 秒
    showZoomLevel.value = true
    if (zoomLevelTimer.value) {
      clearTimeout(zoomLevelTimer.value)
    }
    zoomLevelTimer.value = setTimeout(() => {
      showZoomLevel.value = false
      zoomLevelTimer.value = null
    }, 2000)
  }
}

const handleBlobSrcChange = (blobSrc: string | null) => {
  currentBlobSrc.value = blobSrc
}

const handleImageLoaded = () => {
  // 图片加载完成时显示缩放倍率 2 秒
  showZoomLevel.value = true
  if (zoomLevelTimer.value) {
    clearTimeout(zoomLevelTimer.value)
  }
  zoomLevelTimer.value = setTimeout(() => {
    showZoomLevel.value = false
    zoomLevelTimer.value = null
  }, 2000)
}

// 纹理（WebGL）构建完成后照旧短暂显示缩放倍率指示 2 秒。
// 纹理构建是异步的，比 @load 晚完成，若不在此展示指示器会在构建期间白白消失。
// 无倍率值时以适配值 1.0x 兜底，保证每次切换/构建后都有倍率标识浮现。
const handleTextureReady = () => {
  currentTextureReady.value = true
  if (!zoomLevel.value) {
    zoomLevel.value = 1
  }
  showZoomLevel.value = true
  if (zoomLevelTimer.value) {
    clearTimeout(zoomLevelTimer.value)
  }
  zoomLevelTimer.value = setTimeout(() => {
    showZoomLevel.value = false
    zoomLevelTimer.value = null
  }, 2000)
}

// LivePhoto processing and playback functions
const processCurrentLivePhoto = async () => {
  const photo = currentPhoto.value
  if (!photo || !photo.isLivePhoto || !photo.livePhotoVideoUrl) return

  try {
    const blob = await convertMovToMp4(photo.livePhotoVideoUrl, photo.id)
    if (blob) {
      livePhotoVideoBlob.value = blob
      // Clean up previous blob URL
      if (livePhotoVideoBlobUrl.value) {
        URL.revokeObjectURL(livePhotoVideoBlobUrl.value)
      }
      livePhotoVideoBlobUrl.value = URL.createObjectURL(blob)
    }
  } catch (error) {
    console.error('Failed to process LivePhoto in viewer:', error)
  }
}

const playLivePhotoVideo = () => {
  if (!livePhotoVideoRef.value || !livePhotoVideoBlobUrl.value) return

  livePhotoVideoRef.value.currentTime = 0
  isLivePhotoPlaying.value = true

  // Provide haptic feedback on mobile when starting playback
  if (isMobile.value && 'vibrate' in navigator) {
    navigator.vibrate(50) // Short vibration for start
  }

  livePhotoVideoRef.value?.play().catch((error: any) => {
    console.warn('Failed to play LivePhoto video in viewer:', error)
    isLivePhotoPlaying.value = false
  })
}

const stopLivePhotoVideo = () => {
  const wasPlaying = isLivePhotoPlaying.value

  if (livePhotoVideoRef.value && !livePhotoVideoRef.value.paused) {
    livePhotoVideoRef.value?.pause()
    livePhotoVideoRef.value.currentTime = 0

    // Provide haptic feedback on mobile when manually stopping playback
    if (isMobile.value && wasPlaying && 'vibrate' in navigator) {
      navigator.vibrate(25) // Very short vibration for manual stop
    }
  }
  isLivePhotoPlaying.value = false
}

const handleLivePhotoMouseEnter = () => {
  if (
    !isMobile.value &&
    currentPhoto.value?.isLivePhoto &&
    livePhotoVideoBlobUrl.value
  ) {
    isLivePhotoHovering.value = true
    playLivePhotoVideo()
  }
}

const handleLivePhotoMouseLeave = () => {
  if (!isMobile.value) {
    isLivePhotoHovering.value = false
    stopLivePhotoVideo()
  }
}

const handleLivePhotoTouchStart = (event: TouchEvent) => {
  if (
    isMobile.value &&
    currentPhoto.value?.isLivePhoto &&
    livePhotoVideoBlobUrl.value
  ) {
    touchCount.value = event.touches.length

    // Only handle single finger touch to avoid conflicts with pinch-to-zoom
    if (event.touches.length === 1) {
      // Check if the touch target is an interactive element (button, etc.)
      const target = event.target as HTMLElement
      const isInteractiveElement =
        target.closest('button') ||
        target.closest('[role="button"]') ||
        target.classList.contains('pointer-events-auto')

      // Don't prevent default for interactive elements to allow clicks
      if (!isInteractiveElement) {
        // Prevent browser's default long-press actions (context menu, image save dialog, etc.)
        event.preventDefault()
        isLivePhotoTouching.value = true

        // Set a 500ms timer before starting playback
        longPressTimer.value = setTimeout(() => {
          // Double check: only play if still single touch and touching
          if (
            isLivePhotoTouching.value &&
            touchCount.value === 1 &&
            !isImageZoomed.value
          ) {
            playLivePhotoVideo()
          }
        }, 350)
      }
    }
  }
}

const handleLivePhotoTouchEnd = () => {
  if (isMobile.value) {
    touchCount.value = 0
    isLivePhotoTouching.value = false

    // Clear the long press timer
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value)
      longPressTimer.value = null
    }

    // Stop video playback
    stopLivePhotoVideo()
  }
}

const handleLivePhotoTouchMove = (event: TouchEvent) => {
  if (isMobile.value && isLivePhotoTouching.value) {
    touchCount.value = event.touches.length

    // If user adds more fingers (pinch-to-zoom), cancel LivePhoto playback
    if (event.touches.length > 1) {
      isLivePhotoTouching.value = false

      // Clear the long press timer
      if (longPressTimer.value) {
        clearTimeout(longPressTimer.value)
        longPressTimer.value = null
      }

      // Stop video playback
      stopLivePhotoVideo()
    }
  }
}

const handleLivePhotoVideoEnded = () => {
  // Provide haptic feedback on mobile when ending playback
  if (isMobile.value && 'vibrate' in navigator) {
    navigator.vibrate(30) // Shorter vibration for end
  }

  // Video ended naturally, keep it visible but reset to beginning
  if (livePhotoVideoRef.value) {
    livePhotoVideoRef.value.currentTime = 0
  }
}

const clearConfetti = useDebounceFn(() => {
  confettiIcon.value = null
}, 1600)

const decreaseReactionCountSafely = (reactionId: string) => {
  const currentCount = reactionCounts.value[reactionId] || 0
  reactionCounts.value[reactionId] = Math.max(0, currentCount - 1)
}

// Reaction handlers
const handleReactionSelect = async (reactionId: string, iconName: string) => {
  if (!currentPhoto.value || isLoadingReaction.value) return

  const photoId = currentPhoto.value.id
  const previousSelectedReaction = selectedReaction.value
  const previousReactionCounts = { ...reactionCounts.value }
  const isRemovingCurrentReaction = previousSelectedReaction === reactionId

  isLoadingReaction.value = true
  showReactionPicker.value = false

  // 乐观更新：先更新本地状态，再发送请求
  if (isRemovingCurrentReaction) {
    selectedReaction.value = null
    decreaseReactionCountSafely(reactionId)
  } else {
    if (previousSelectedReaction) {
      decreaseReactionCountSafely(previousSelectedReaction)
    }
    selectedReaction.value = reactionId
    reactionCounts.value[reactionId] =
      (reactionCounts.value[reactionId] || 0) + 1
  }

  try {
    if (isRemovingCurrentReaction) {
      await $fetch(`/api/photos/${photoId}/reactions`, {
        method: 'DELETE',
      })
    } else {
      await $fetch(`/api/photos/${photoId}/reactions`, {
        method: 'POST',
        body: { reactionType: reactionId },
      })

      // 触发礼花效果
      confettiIcon.value = iconName
      confettiTriggerCount.value++

      // 在动画完成后清除 confetti
      clearConfetti()
    }
  } catch (error: any) {
    // 请求失败时回滚乐观更新
    selectedReaction.value = previousSelectedReaction
    reactionCounts.value = previousReactionCounts

    console.error('Failed to update reaction:', error)

    // 显示错误提示
    if (error?.statusCode === 429) {
      toast.add({
        icon: 'tabler:alert-circle',
        title: $t('viewer.reaction.error.title'),
        description: $t('viewer.reaction.error.rateLimited'),
        color: 'warning',
      })
    } else {
      toast.add({
        icon: 'tabler:alert-circle',
        title: $t('viewer.reaction.error.title'),
        description: error instanceof Error ? error.message : $t('common.unknownError'),
        color: 'warning',
      })
    }
  } finally {
    isLoadingReaction.value = false
  }
}

const toggleReactionPicker = () => {
  if (shouldCloseReactionPickerOnClick.value) {
    showReactionPicker.value = false
    shouldCloseReactionPickerOnClick.value = false
    return
  }

  showReactionPicker.value = !showReactionPicker.value
}

const handleReactionButtonPointerDown = () => {
  shouldCloseReactionPickerOnClick.value = showReactionPicker.value
}

// 监听当前照片变化，加载表态数据
watch(
  () => currentPhoto.value?.id,
  (newPhotoId) => {
    if (newPhotoId) {
      loadPhotoReactions(newPhotoId)
    }
  },
  { immediate: true },
)

defineShortcuts({
  escape: () => {
    emit('close')
  },
})

// 清理定时器
onUnmounted(() => {
  if (zoomLevelTimer.value) {
    clearTimeout(zoomLevelTimer.value)
    zoomLevelTimer.value = null
  }

  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }

  // Clean up LivePhoto blob URL
  if (livePhotoVideoBlobUrl.value) {
    URL.revokeObjectURL(livePhotoVideoBlobUrl.value)
    livePhotoVideoBlobUrl.value = null
  }
})

// Swiper modules
const swiperModules = [Navigation, Keyboard, Virtual]

// ===== 与 afilmory 一致的动效预设 =====
// smooth = { type:'spring', duration:0.4, bounce:0 }，snappy = { type:'spring', duration:0.4, bounce:0.15 }
const SPRING_SMOOTH = { type: 'spring', duration: 0.4, bounce: 0 } as const
const SPRING_SNAPPY = { type: 'spring', duration: 0.4, bounce: 0.15 } as const

// 桌面端信息面板默认折叠；用户通过照片右上角"展开信息"按钮手动打开
const isDesktopInspectorVisible = ref(false)

// 面板折叠/展开会改变图片舞台宽度（flex 布局重排）：
// - WebGL 画布 resize 后需重新适配图片（imageRefitKey 自增触发 ProgressiveImage 处理）
// - Swiper 未启用 observer，容器宽度变化不会被自动感知，需手动 update()，
//   否则滑动器/幻灯片位置不随新宽度重排，导致查看界面布局错乱
const imageRefitKey = ref(0)

// 桌面端：信息面板展开时，让图片舞台右侧收缩出面板宽度（InfoPanel 为绝对定位
// 覆盖层 w-80=320px，不参与布局重排），使图片在面板左侧区域内渲染、不被遮挡；
// 面板折叠后恢复全屏自适应。
const stageInlinePaddingRight = computed(() =>
  !isMobile.value && isDesktopInspectorVisible.value ? '320px' : '0px',
)

// 叠影/重影修复：面板折叠/展开会改变图片舞台宽度。WebGL 画布宽度随之变化时，
// 在引擎完成"清空缓冲+重绘"之前的同一帧里，陈旧帧会被 CSS 拉伸成残影，视觉上即
// "照片折叠出去重影"。因此：宽度变化一开始就把照片层整体隐藏（凭背景高斯模糊兜
// 底，界面不空洞），等舞台宽度翻转 + WebGL 重绘稳定后再淡入并重新适配。
// 这样无论图片开合快慢，拉伸的陈旧帧都不可见，叠影被彻底消除。
const stageResizing = ref(false)
let resizeGuardTimer: ReturnType<typeof setTimeout> | null = null

// 容器宽度变化后（信息面板折叠/展开、窗口缩放），令 Swiper 按当前索引重新铺排并
// 重锚 wrapper 位移到视口内。
// 仅调用 swiper.update() 只会重算滑块尺寸，不会把当前照片重新放到新宽度下的视野中央：
// 虚拟滑块会沿用旧的偏移，当前照片被整体滑出视口（表现为"图片飘走 / 全屏高斯模糊"）。
// 因此需要再强制 virtual.update(true) 把虚拟滑块窗口整窗重排，重置每个滑块内联偏移
// （Virtual 模块没有 render() 方法，只有 update(force) 能强制以新宽度重建滑块），
// 最后 slideTo(active) 以 0 速度把当前照片重锚回视野中央。
const refitSwiper = () => {
  const swiper = swiperRef.value
  if (!swiper) return
  swiper.update()
  swiper.virtual?.update(true)
  swiper.slideTo(swiper.activeIndex, 0, false)
}

const restoreStage = () => {
  stageResizing.value = false
  nextTick(() => {
    imageRefitKey.value++
    refitSwiper()
  })
}
watch(isDesktopInspectorVisible, () => {
  if (resizeGuardTimer) clearTimeout(resizeGuardTimer)
  stageResizing.value = true
  // 覆盖：160ms padding 去抖翻转 + 舞台重排 + WebGL 重绘余量
  resizeGuardTimer = setTimeout(restoreStage, 560)
})

// 舞台宽度一步到位翻转（160ms 去抖，避免频繁点击导致反复重排抖动）
const stagePadRight = ref(stageInlinePaddingRight.value)
let padTimer: ReturnType<typeof setTimeout> | null = null
watch(stageInlinePaddingRight, (v) => {
  if (padTimer) clearTimeout(padTimer)
  padTimer = setTimeout(() => {
    stagePadRight.value = v
  }, 160)
})
onUnmounted(() => {
  if (padTimer) clearTimeout(padTimer)
  if (resizeGuardTimer) clearTimeout(resizeGuardTimer)
})

// 入场「内容可见」门控：打开后短暂延迟，工具栏/覆盖层等 UI 等入场动画先行，
// 之后再淡入——与 afilmory 的 isViewerContentVisible 行为一致
const entryDone = ref(false)
let entryTimer: ReturnType<typeof setTimeout> | null = null
const chromeVisible = computed(() => props.isOpen && entryDone.value)
watch(
  () => props.isOpen,
  (open) => {
    if (entryTimer) clearTimeout(entryTimer)
    entryDone.value = false
    if (open) {
      entryTimer = setTimeout(() => {
        entryDone.value = true
      }, 420)
    } else {
      isDesktopInspectorVisible.value = false
    }
  },
  { immediate: true },
)
onUnmounted(() => {
  if (entryTimer) clearTimeout(entryTimer)
})

// 窗口尺寸变化 → 图片位置偏移修复：
// 本版本无内置窗口 resize 处理，而 swiper 也不自动跟随容器宽度变化。
// 若缩放窗口后不重排滑块，滑块的宽度（即 WebGL 画布宽度）保持旧值，
// 引擎 getBoundingClientRect 不变 → resize() 提前 return → 图片停留在旧尺寸/旧位置，
// 相对新的舞台偏移到一侧，露出大片模糊背景（看起来"全是高斯模糊"）。
// 这里在窗口 resize 时用 rAF 合并帧调用 swiper.update()，滑块宽度设为当前容器宽，
// 画布随之变为新尺寸 → 引擎 ResizeObserver 触发 resize() → getFitScale 重新居中。
const handleWindowResizeRefit = () => {
  requestAnimationFrame(() => {
    refitSwiper()
  })
}
onMounted(() => window.addEventListener('resize', handleWindowResizeRefit))
onUnmounted(() => window.removeEventListener('resize', handleWindowResizeRefit))
</script>

<template>
  <Teleport to="body">
    <!-- 背景层：当前图片的高斯模糊大背景（颜色随当前图自适应，100% 不透明遮挡底层页面，
         清晰主图浮在其上层；switch 图片时仅更新 src，不整屏闪变） -->
    <AnimatePresence>
      <motion.div
        v-if="isOpen"
        :initial="{ opacity: 1 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.3 }"
        class="fixed inset-0 z-30 overflow-hidden bg-[#3a3a42]"
      >
        <!-- 模糊图片本体：放大 + 强 blur，避免四周露边，颜色随当前图变化；
             打开/切换时先隐藏，@load 就绪后平滑淡入，避免"黑屏闪断" -->
        <img
          v-if="currentPhoto?.thumbnailUrl"
          :key="currentPhoto?.id ?? 'empty'"
          :src="currentPhoto.thumbnailUrl"
          alt=""
          aria-hidden="true"
          draggable="false"
          class="absolute inset-0 h-full w-full scale-[1.8] object-cover transition-opacity duration-700"
          :class="blurReady ? 'opacity-100' : 'opacity-0'"
          style="filter: blur(64px) saturate(1.1) brightness(1.45)"
          @load="blurReady = true"
        />
        <!-- 无缩略图时的兜底浅灰 -->
        <div
          v-else
          class="absolute inset-0 h-full w-full bg-[#3a3a42]"
        />
        <!-- 主题自适应提亮渐变：浅色模式整体提亮（黑色照片也变灰白）；暗色模式轻微压暗保证工具栏/控件可读性 -->
        <div
          class="pointer-events-none absolute inset-0 h-full w-full bg-linear-to-b from-white/12 via-transparent to-white/5 dark:from-black/20 dark:via-transparent dark:to-black/30"
        />
      </motion.div>
    </AnimatePresence>

    <!-- 主内容区域 -->
    <AnimatePresence>
      <motion.div
        v-if="isOpen"
        ref="containerRef"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.3 }"
        class="fixed inset-0 z-50 flex items-center justify-center"
        :style="{ touchAction: isMobile ? 'manipulation' : 'none' }"
        @click.self="emit('close')"
      >
        <div class="relative h-full w-full">
          <!-- 图片显示区域 -->
          <div class="z-10 flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <div class="group/photo-viewer relative flex min-h-0 min-w-0 flex-1">
              <!-- 顶部工具栏（afilmory 布局：左侧标题/信息按钮，右侧操作按钮） -->
              <motion.div
                :initial="false"
                :animate="{ opacity: chromeVisible ? 1 : 0 }"
                :transition="SPRING_SNAPPY"
                class="pointer-events-none absolute z-40 flex items-center justify-between gap-3"
                :class="
                  isMobile ? 'top-2 right-2 left-2' : 'top-4 right-4 left-4'
                "
              >
                <!-- 左侧工具按钮 -->
                <div class="pointer-events-auto flex items-center gap-2">
                  <!-- 信息按钮 - 在移动设备上显示（桌面端改由照片右上角展开） -->
                  <button
                    v-if="isMobile"
                    type="button"
                    aria-label="info"
                    class="flex size-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
                    :class="showExifPanel ? 'bg-black/50' : ''"
                    @click="showExifPanel = !showExifPanel"
                  >
                    <Icon name="tabler:info-circle" class="size-5" />
                  </button>

                  <!-- 照片标题 - 桌面端显示 -->
                  <span
                    v-if="!isMobile && currentPhoto?.title"
                    class="truncate rounded-full bg-black/35 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm"
                  >
                    {{ currentPhoto.title }}
                  </span>

                  <!-- LivePhoto 标志 -->
                  <PhotoLivePhotoIndicator
                    v-if="currentPhoto?.isLivePhoto"
                    :class="isMobile ? 'cursor-default' : 'cursor-pointer'"
                    :photo="currentPhoto"
                    :is-video-playing="isLivePhotoPlaying"
                    :processing-state="livePhotoProcessingState?.value || null"
                    @mouseenter="handleLivePhotoMouseEnter"
                    @mouseleave="handleLivePhotoMouseLeave"
                  />

                  <!-- 静音图标 -->
                  <div
                    v-if="currentPhoto?.isLivePhoto"
                    class="pointer-events-auto backdrop-blur-md bg-black/40 text-white rounded-full p-1 text-[13px] font-bold flex items-center gap-0.5 leading-0 select-none"
                    :class="isMobile ? 'cursor-default' : 'cursor-pointer'"
                    @click="isLivePhotoMuted = !isLivePhotoMuted"
                  >
                    <Icon
                      :name="
                        isLivePhotoMuted ? 'tabler:volume-off' : 'tabler:volume'
                      "
                      class="size-4.25"
                    />
                  </div>
                </div>
              </motion.div>

              <!-- 加载指示器 -->
              <LoadingIndicator ref="loadingIndicatorRef" />

              <!-- 图片舞台（afilmory：入场 catchup 纹理层 + Swiper）
                   阶段重排（信息面板折叠/展开改宽度）期间隐藏照片层，避免 WebGL 陈旧帧
                   被拉伸成叠影；重排完成后再淡入 -->
              <div
                class="relative flex h-full w-full items-center justify-center"
                :class="stageResizing ? 'opacity-0' : 'photo-stage-reveal'"
                data-photo-viewer-stage="true"
                :style="{
                  touchAction: isMobile ? 'pan-x pinch-zoom' : 'pan-y',
                  paddingRight: stagePadRight,
                  paddingBottom: thumbBarBottomPad,
                }"
              >
                <!-- 主图区域：图像加载仅保留 ProgressiveImage 自身「构建纹理」从模糊到清晰，
                     不再叠加外层缩略图兜底层，避免双重模糊 -->

              <!-- Swiper 容器 -->
              <Swiper
                :modules="swiperModules"
                :space-between="0"
                :slides-per-view="1"
                :initial-slide="currentIndex"
                :virtual="true"
                :keyboard="{
                  enabled: true,
                  onlyInViewport: true,
                }"
                class="h-full w-full"
                :style="{ touchAction: isMobile ? 'pan-x' : 'pan-y' }"
                @swiper="handleSwiperInit"
                @slide-change="handleSlideChange"
              >
                <SwiperSlide
                  v-for="(photo, index) in photos"
                  :key="photo.id"
                  :virtual-index="index"
                  class="flex items-center justify-center"
                >
                  <motion.div
                    :initial="{ opacity: 0.5, scale: 0.95 }"
                    :animate="{ opacity: 1, scale: 1 }"
                    :exit="{ opacity: 0, scale: 0.95 }"
                    :transition="SPRING_SMOOTH"
                    class="relative flex h-full w-full items-center justify-center"
                    style="
                      user-select: none;
                      -webkit-user-select: none;
                      -webkit-touch-callout: none;
                      -webkit-tap-highlight-color: transparent;
                    "
                    @touchstart="handleLivePhotoTouchStart"
                    @touchmove="handleLivePhotoTouchMove"
                    @touchend="handleLivePhotoTouchEnd"
                    @touchcancel="handleLivePhotoTouchEnd"
                    @contextmenu.prevent=""
                  >
                    <!-- 视频媒体（本地库视频） -->
                    <video
                      v-if="photo.type === 'video'"
                      :src="photo.originalUrl!"
                      class="h-full w-full object-contain transition-opacity duration-400"
                      :poster="photo.thumbnailUrl || undefined"
                      controls
                      playsinline
                      preload="metadata"
                    ></video>

                    <!-- Main Image -->
                    <ProgressiveImage
                      v-else
                      class="h-full w-full object-contain transition-opacity duration-400"
                      :class="{
                        'opacity-0':
                          isLivePhotoPlaying && currentPhoto?.isLivePhoto,
                      }"
                      :refit-key="imageRefitKey"
                      :loading-indicator-ref="loadingIndicatorRef || null"
                      :is-current-image="index === currentIndex"
                      :src="photo.originalUrl!"
                      :thumbnail-src="photo.thumbnailUrl!"
                      :thumbhash="photo.thumbnailHash"
                      :show-thumb-placeholder="isMobile"
                      :alt="photo.title || ''"
                      :width="
                        index === currentIndex
                          ? (currentPhoto?.width ?? undefined)
                          : undefined
                      "
                      :height="
                        index === currentIndex
                          ? (currentPhoto?.height ?? undefined)
                          : undefined
                      "
                      :enable-pan="
                        index === currentIndex
                          ? !isMobile || isImageZoomed
                          : true
                      "
                      :enable-zoom="true"
                      :on-zoom-change="
                        index === currentIndex ? handleZoomChange : undefined
                      "
                      :on-blob-src-change="
                        index === currentIndex ? handleBlobSrcChange : undefined
                      "
                      :on-image-loaded="
                        index === currentIndex ? handleImageLoaded : undefined
                      "
                      :on-texture-ready="
                        index === currentIndex
                          ? handleTextureReady
                          : undefined
                      "
                      :is-live-photo="photo.isLivePhoto === 1"
                      :live-photo-video-url="
                        photo.livePhotoVideoUrl || undefined
                      "
                    />

                    <!-- LivePhoto Video -->
                    <motion.video
                      v-if="
                        photo.isLivePhoto &&
                        index === currentIndex &&
                        livePhotoVideoBlobUrl
                      "
                      :ref="
                        (el) => {
                          if (index === currentIndex) livePhotoVideoRef = el
                        }
                      "
                      :src="livePhotoVideoBlobUrl"
                      class="absolute inset-0 w-full h-full object-contain pointer-events-none select-none touch-none"
                      :muted="isLivePhotoMuted"
                      playsinline
                      preload="metadata"
                      :initial="{ opacity: 0 }"
                      :animate="{
                        opacity: isLivePhotoPlaying ? 1 : 0,
                      }"
                      :transition="{
                        duration: 0.4,
                        ease: [0.25, 0.1, 0.25, 1],
                        delay: isLivePhotoPlaying ? 0.1 : 0,
                      }"
                      @ended="handleLivePhotoVideoEnded"
                      @contextmenu.prevent=""
                    />

                    <!-- 缩放倍率提示 -->
                    <AnimatePresence>
                      <motion.div
                        v-if="showZoomLevel && zoomLevel > 0"
                        :initial="{ opacity: 0, y: 10 }"
                        :animate="{ opacity: 1, y: 0 }"
                        :exit="{ opacity: 0, y: 10 }"
                        :transition="{ duration: 0.2 }"
                        class="absolute bottom-4 left-4 z-20 bg-black/40 backdrop-blur-3xl rounded-xl border border-white/10 px-4 py-2 shadow-2xl"
                      >
                        <span class="text-white font-medium"
                          >{{ Number(zoomLevel).toFixed(1) }}x</span
                        >
                      </motion.div>
                    </AnimatePresence>

                    <!-- 操作提示 -->
                    <AnimatePresence>
                      <motion.div
                        v-if="!isImageZoomed && !isLivePhotoPlaying"
                        :initial="{ opacity: 0, scale: 0.95 }"
                        :animate="{ opacity: 0.6, scale: 1 }"
                        :exit="{ opacity: 0, scale: 0.95 }"
                        :transition="{ duration: 0.2 }"
                        class="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 bg-black/50 rounded-lg border border-white/10 px-2 py-1 shadow-2xl text-white text-xs font-bold"
                      >
                        <span v-if="currentPhoto?.isLivePhoto && isMobile">
                          {{ $t('viewer.hint.livePhoto.mobile') }}
                        </span>
                        <span
                          v-else-if="currentPhoto?.isLivePhoto && !isMobile"
                        >
                          {{ $t('viewer.hint.livePhoto.desktop') }}
                        </span>
                        <span v-else>
                          {{
                            isMobile
                              ? $t('viewer.hint.mobile')
                              : $t('viewer.hint.desktop')
                          }}
                        </span>
                      </motion.div>
                    </AnimatePresence>

                    <!-- 表态按钮 -->
                    <AnimatePresence>
                      <motion.div
                        v-if="
                          !isImageZoomed &&
                          !isLivePhotoPlaying &&
                          currentTextureReady
                        "
                        :initial="{ opacity: 0, scale: 0.8, y: 20 }"
                        :animate="{ opacity: 1, scale: 1, y: 0 }"
                        :exit="{ opacity: 0, scale: 0.8, y: 20 }"
                        :transition="{
                          type: 'spring',
                          stiffness: 300,
                          damping: 20,
                          delay: 0.1,
                        }"
                        class="absolute bottom-4 right-4 z-20"
                      >
                        <div class="relative">
                          <!-- 表态选择器 -->
                          <ReactionPicker
                            :is-open="showReactionPicker"
                            :trigger-el="reactionButtonRef"
                            :selected-reaction="selectedReaction"
                            :reaction-counts="reactionCounts"
                            @select="handleReactionSelect"
                            @close="showReactionPicker = false"
                          />

                          <!-- 礼花效果 -->
                          <ReactionConfetti
                            v-if="confettiIcon"
                            :icon-name="confettiIcon"
                            :trigger-count="confettiTriggerCount"
                          />

                          <!-- 表态按钮 -->
                          <motion.button
                            ref="reactionButtonRef"
                            type="button"
                            :initial="{ scale: 0.8, opacity: 0 }"
                            :animate="{
                              scale: showReactionPicker ? 0.92 : 1,
                              opacity: 1,
                              transition: showReactionPicker
                                ? { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
                                : {
                                    type: 'spring',
                                    stiffness: 300,
                                    damping: 25,
                                    mass: 0.8,
                                  },
                            }"
                            :while-hover="{
                              scale: showReactionPicker ? 0.95 : 1.05,
                            }"
                            :while-tap="{ scale: 0.88 }"
                            :class="[
                              'pointer-events-auto flex items-center justify-center gap-2 cursor-pointer',
                              'px-4 h-11 rounded-full',
                              'backdrop-blur-xl border shadow-lg',
                              'transition-all duration-200',
                              selectedReaction
                                ? 'bg-blue-500/90 border-blue-400/50 text-white shadow-blue-500/30'
                                : 'bg-white/90 dark:bg-neutral-800/90 border-neutral-200/50 dark:border-white/10 text-neutral-700 dark:text-white/80 shadow-black/10 dark:shadow-black/30',
                              'hover:shadow-xl',
                            ]"
                            @pointerdown="handleReactionButtonPointerDown"
                            @click="toggleReactionPicker"
                          >
                            <Icon
                              v-if="selectedReaction && currentReactionIcon"
                              :name="currentReactionIcon"
                              class="text-xl leading-none select-none"
                            />
                            <Icon
                              v-else
                              name="tabler:mood-smile"
                              class="text-xl"
                            />
                            <div class="flex flex-col items-start gap-0.5">
                              <span class="text-sm font-medium leading-none">
                                {{
                                  selectedReaction
                                    ? $t('viewer.reaction.change')
                                    : $t('viewer.reaction.add')
                                }}
                              </span>
                              <span
                                v-if="totalReactions > 0"
                                class="text-[10px] leading-none opacity-70"
                              >
                                {{
                                  $t(
                                    'viewer.reaction.count',
                                    { count: totalReactions },
                                    totalReactions,
                                  )
                                }}
                              </span>
                            </div>
                          </motion.button>
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    <!-- 分享 / 关闭：与 afilmory 同步，悬浮在照片内部右上角（在图片舞台内、
                         随舞台收缩/展开 自适应移动，不开在信息侧栏上） -->
                    <div
                      v-if="index === currentIndex && !isImageZoomed"
                      class="absolute top-4 right-4 z-30 flex items-center gap-2 pointer-events-auto"
                    >
                      <!-- 展开/收起信息面板 - 桌面端（右上角） -->
                      <button
                        v-if="!isMobile"
                        type="button"
                        :aria-label="
                          isDesktopInspectorVisible ? 'collapse info' : 'expand info'
                        "
                        class="flex size-8 items-center justify-center rounded-full backdrop-blur-2xl duration-200 hover:bg-black/40"
                        style="background-color: rgba(var(--cm-material-thick)); color: rgb(var(--cm-text))"
                        @click="isDesktopInspectorVisible = !isDesktopInspectorVisible"
                      >
                        <Icon
                          :name="
                            isDesktopInspectorVisible
                              ? 'tabler:layout-sidebar-right-collapse'
                              : 'tabler:layout-sidebar-right-expand'
                          "
                          class="size-4.5"
                        />
                      </button>

                      <button
                        type="button"
                        aria-label="share photo"
                        :title="$t('viewer.share')"
                        class="flex size-8 items-center justify-center rounded-full backdrop-blur-2xl duration-200 hover:bg-black/40"
                        style="background-color: rgba(var(--cm-material-thick)); color: rgb(var(--cm-text))"
                        @click="showShareModal = true"
                      >
                        <Icon name="tabler:share-3" class="size-4.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="close"
                        :title="$t('viewer.close')"
                        class="flex size-8 items-center justify-center rounded-full backdrop-blur-2xl duration-200 hover:bg-black/40"
                        style="background-color: rgba(var(--cm-material-thick)); color: rgb(var(--cm-text))"
                        @click="emit('close')"
                      >
                        <Icon name="tabler:x" class="size-4.5" />
                      </button>
                    </div>
                  </motion.div>
                </SwiperSlide>
              </Swiper>

                <!-- 自定义导航按钮 (桌面端) -->
                <template v-if="!isMobile">
                  <button
                    v-if="currentIndex > 0"
                    type="button"
                    class="absolute top-1/2 left-4 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-white opacity-0 backdrop-blur-sm duration-200 bg-black/30 hover:bg-black/40 group-hover/photo-viewer:opacity-100"
                    @click="handlePrevious"
                  >
                    <Icon
                      name="tabler:chevron-left"
                      class="text-xl cursor-pointer"
                    />
                  </button>

                  <button
                    v-if="currentIndex < photos.length - 1"
                    type="button"
                    class="absolute top-1/2 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-white opacity-0 backdrop-blur-sm duration-200 bg-black/30 hover:bg-black/40 group-hover/photo-viewer:opacity-100 transition-[right]"
                    :class="
                      !isMobile && isDesktopInspectorVisible
                        ? 'right-[336px]'
                        : 'right-4'
                    "
                    @click="handleNext"
                  >
                    <Icon
                      name="tabler:chevron-right"
                      class="text-xl cursor-pointer"
                    />
                  </button>
                </template>
                </div>
              </div>

            <!-- 缩略图导航：绝对定位悬浮于底部，放大时隐藏且不改变图片舞台布局（消除“被拉一下”的跳变）。
             保留组件自带的上滑/下滑动画；外层 pointer-events-none，仅缩略图本体可点击 -->
            <div class="pointer-events-none absolute inset-x-0 bottom-0 z-20">
              <AnimatePresence>
                <GalleryThumbnail
                  v-if="!isImageZoomed && !isBottomNavHidden"
                  class="pointer-events-auto"
                  :current-index="currentIndex"
                  :photos="photos"
                  @index-change="emit('indexChange', $event)"
                />
              </AnimatePresence>
            </div>
          </div>
        </div>

        <!-- EXIF/信息面板 - 覆盖层：桌面端右侧悬浮、移动端底部弹层。
             随查看器打开即常驻挂载以预热数据（直方图/影调/相册加载），通过 visible 控制显隐 -->
        <InfoPanel
          v-if="isOpen && currentPhoto"
          :key="currentPhoto.id"
          :current-photo="currentPhoto"
          :exif-data="currentPhoto?.exif"
          :visible="isMobile ? showExifPanel : isDesktopInspectorVisible"
          :on-close="
            () =>
              isMobile
                ? (showExifPanel = false)
                : (isDesktopInspectorVisible = false)
          "
        />
      </motion.div>
    </AnimatePresence>

    <!-- Share Modal -->
    <PhotoShareModal
      v-if="currentPhoto"
      :is-open="showShareModal"
      :photo="currentPhoto"
      @close="showShareModal = false"
    />
  </Teleport>
</template>

<style scoped>
/* Swiper 样式调整 */
.swiper {
  width: 100%;
  height: 100%;
}

/* 照片层从"重排隐藏"恢复到显示：仅淡入不淡出（隐藏瞬间完成，避免陈旧帧被拉伸时可见） */
.photo-stage-reveal {
  transition: opacity 0.25s ease;
}

.swiper-slide {
  text-align: center;
  font-size: 18px;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
