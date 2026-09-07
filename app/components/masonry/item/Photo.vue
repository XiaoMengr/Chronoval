<script setup lang="ts">
import { motion, useDomRef } from 'motion-v'

interface Props {
  photo: Photo
  index: number
  columnWidth?: number
}

const props = withDefaults(defineProps<Props>(), {
  columnWidth: 250,
})
const emit = defineEmits<{
  'visibility-change': [
    { index: number; isVisible: boolean; date: string | Date },
  ]
  openViewer: [number]
}>()

const { gtag } = useGtag()

const isLoading = ref(true)
const photoRef = ref<HTMLElement>()
const videoRef = useDomRef()
const isVisible = ref(false)
const containerWidth = ref(0)

const isHovering = ref(false)
const isVideoPlaying = ref(false)
const isVideoLoaded = ref(false)
const videoBlob = ref<Blob | null>(null)
const videoBlobUrl = ref<string | null>(null)
const { convertMovToMp4, getProcessingState } = useLivePhotoProcessor()

const isTouching = ref(false)
const touchCount = ref(0)
const longPressTimer = ref<NodeJS.Timeout | null>(null)
const initialTouchPos = ref<{ x: number; y: number } | null>(null)
const isMobile = useMediaQuery('(max-width: 768px)')

// 画廊照片卡片圆角：由后台「外观」设置控制，默认关闭（圆角 0），开启后按设定值生效
const cardCornerEnabled = useSettingRef('app:appearance.cardCornerRadius')
const cardCornerValue = useSettingRef('app:appearance.cardCornerRadiusValue')
const cardRadius = computed(() => {
  if (!cardCornerEnabled.value) return '0px'
  return `${Number(cardCornerValue.value) || 0}px`
})

const intersectionObserverRef = ref<IntersectionObserver | null>(null)

const processingState = getProcessingState(props.photo.id)

const aspectRatio = computed(() => {
  // Priority 1: Use aspectRatio from photo data if available
  if (props.photo.aspectRatio) {
    return props.photo.aspectRatio
  }

  // Priority 2: Calculate from width and height if available
  if (props.photo.width && props.photo.height) {
    return props.photo.height / props.photo.width
  }

  // Fallback: Default aspect ratio
  return 1.2
})

// 卡片实际渲染高度 ≈ 列宽 ÷ aspectRatio（aspectRatio 为 CSS 长宽比 width/height）。
// 用于给 `content-visibility` 跳过渲染的视口外卡片提供正确的固有高度，
// 避免首帧瀑布流用固定兜底 320px 参与排版导致首页排版错乱（首图莫名放大）。
const intrinsicSize = computed(() => {
  const height = Math.round((props.columnWidth || 250) / aspectRatio.value)
  return Math.max(height, 100)
})

// Afilmory 式悬浮详情：格式 · 尺寸 · 大小
const format = computed(() => {
  const url = props.photo.originalUrl || ''
  const match = url.match(/\.([a-zA-Z0-9]{2,4})(?:\?|$)/)
  return match ? match[1].toUpperCase() : undefined
})

const sizeText = computed(() => {
  const bytes = props.photo.fileSize
  if (!bytes) return undefined
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
})

const hasDimensions = computed(() => {
  return Boolean(props.photo.width && props.photo.height)
})

const specsText = computed(() => {
  const parts: string[] = []
  if (format.value) parts.push(format.value)
  if (props.photo.width && props.photo.height) {
    parts.push(`${props.photo.width} × ${props.photo.height}`)
  }
  if (sizeText.value) parts.push(sizeText.value)
  return parts.join('  ·  ')
})

// 卡片足够高时才展示 EXIF 网格（Afilmory 阈值 ~200px），且需存在实际 EXIF 数据
const hasExif = computed(
  () =>
    Boolean(props.photo.exif?.FocalLengthIn35mmFormat) ||
    Boolean(props.photo.exif?.FNumber) ||
    Boolean(props.photo.exif?.ExposureTime) ||
    Boolean(props.photo.exif?.ISO),
)

// 相机参数标签：只要存在真实 EXIF 数据即显示（不限卡片高度，避免宽幅照片标签被隐藏）
const showExifGrid = computed(() => {
  if (!hasExif.value) return false
  return Boolean(specsText.value)
})

// Show info overlay only when not playing video or video has finished
const shouldShowInfoOverlay = computed(() => {
  if (!props.photo.isLivePhoto) return true

  // On mobile, don't show overlay when touching or playing video
  if (isMobile.value) {
    if (isTouching.value || isVideoPlaying.value) return false
    return true
  }

  // On desktop, show overlay when hovering but not playing video
  if (!isHovering.value) return true
  if (isVideoPlaying.value) return false
  return isVideoLoaded.value
})

// Methods
const handleImageLoad = () => {
  isLoading.value = false
}

const handleImageError = () => {
  isLoading.value = false
  console.warn(`Failed to load image: ${props.photo.thumbnailUrl}`)
}

// LivePhoto video handling - 优化的交互逻辑
const handleMouseEnter = async () => {
  // Skip mouse events on mobile devices
  if (isMobile.value) return

  isHovering.value = true

  if (!props.photo.isLivePhoto || !props.photo.livePhotoVideoUrl) return

  // 如果视频已准备好，立即播放
  if (videoBlob.value && videoBlobUrl.value && isVideoLoaded.value) {
    playLivePhotoVideo()
  } else if (!processingState.value?.isProcessing) {
    // 如果视频还未处理，立即开始处理
    processLivePhotoWhenVisible()
  }
}

const handleMouseLeave = () => {
  // Skip mouse events on mobile devices
  if (isMobile.value) return

  isHovering.value = false
  if (videoRef.value && !videoRef.value.paused) {
    videoRef.value.pause()
    videoRef.value.currentTime = 0
  }

  // Use a slight delay for smoother transition when mouse leaves
  setTimeout(() => {
    if (!isHovering.value && !isTouching.value) {
      // Also check touching state
      isVideoPlaying.value = false
    }
  }, 150)
}

const playLivePhotoVideo = () => {
  if (!videoRef.value || !videoBlobUrl.value) return

  // 预加载视频以确保流畅播放
  if (videoRef.value.readyState < 2) {
    videoRef.value.load()
  }

  // 确保视频从头开始播放
  videoRef.value.currentTime = 0

  // 添加播放前的准备动画
  isVideoPlaying.value = true

  // Provide haptic feedback on mobile when starting playback
  if (isMobile.value && 'vibrate' in navigator) {
    navigator.vibrate(50) // Short vibration for start
  }

  // 延迟播放以确保动画状态已设置
  nextTick(() => {
    if (!videoRef.value || !isVideoPlaying.value) return

    // 设置视频播放属性
    videoRef.value.muted = true // 确保静音播放
    videoRef.value.playsInline = true

    // 立即尝试播放，使用更好的错误处理
    const playPromise = videoRef.value.play()

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // 播放成功，确保状态正确
          if (videoRef.value && !videoRef.value.paused) {
            // 视频播放成功，状态已正确设置
          }
        })
        .catch((error: any) => {
          console.warn('Failed to play LivePhoto video:', error)
          isVideoPlaying.value = false

          // 如果是因为用户交互策略导致的失败，尝试重新加载
          if (error.name === 'NotAllowedError') {
            console.log('Video play blocked by browser policy, retrying...')
            if (videoRef.value) {
              videoRef.value.load()
              setTimeout(() => {
                if (videoRef.value && isVideoPlaying.value) {
                  const retryPromise = videoRef.value.play()
                  if (retryPromise !== undefined) {
                    retryPromise.catch(() => {
                      isVideoPlaying.value = false
                    })
                  }
                }
              }, 100)
            }
          }
        })
    }
  })
}

const handleVideoEnded = () => {
  // Provide haptic feedback on mobile when ending playback
  if (isMobile.value && 'vibrate' in navigator) {
    navigator.vibrate(30) // Shorter vibration for end
  }

  // Add a small delay before hiding video to make the transition smoother
  setTimeout(() => {
    isVideoPlaying.value = false
  }, 100)
}

// Mobile touch handlers for LivePhoto
const handleTouchStart = (event: TouchEvent) => {
  if (!isMobile.value || !props.photo.isLivePhoto || !videoBlobUrl.value) return

  touchCount.value = event.touches.length

  // Only handle single finger touch to avoid conflicts with pinch-to-zoom and scrolling
  if (event.touches.length === 1) {
    const touch = event.touches[0]
    if (touch) {
      initialTouchPos.value = { x: touch.clientX, y: touch.clientY }
      isTouching.value = true

      // Set a timer for long press (350ms)
      longPressTimer.value = setTimeout(() => {
        // Double check: only play if still single touch and touching
        if (isTouching.value && touchCount.value === 1) {
          playLivePhotoVideo()
        }
      }, 350)
    }
  }
}

const handleTouchMove = (event: TouchEvent) => {
  if (!isMobile.value || !isTouching.value || !initialTouchPos.value) return

  touchCount.value = event.touches.length

  // If user adds more fingers, cancel LivePhoto playback
  if (event.touches.length > 1) {
    cancelLivePhotoTouch()
    return
  }

  // Check if user is moving finger significantly (scrolling intent)
  const touch = event.touches[0]
  if (touch) {
    const deltaX = Math.abs(touch.clientX - initialTouchPos.value.x)
    const deltaY = Math.abs(touch.clientY - initialTouchPos.value.y)
    const threshold = 10 // pixels

    // If movement exceeds threshold, cancel LivePhoto and allow scrolling
    if (deltaX > threshold || deltaY > threshold) {
      cancelLivePhotoTouch()
    }
  }
}

const handleTouchEnd = () => {
  if (!isMobile.value) return

  cancelLivePhotoTouch()
}

const cancelLivePhotoTouch = () => {
  const wasPlaying = isVideoPlaying.value

  touchCount.value = 0
  isTouching.value = false
  initialTouchPos.value = null

  // Clear the long press timer
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }

  // Stop video playback
  if (videoRef.value && !videoRef.value.paused) {
    videoRef.value.pause()
    videoRef.value.currentTime = 0

    // Provide haptic feedback on mobile when manually stopping playback
    if (isMobile.value && wasPlaying && 'vibrate' in navigator) {
      navigator.vibrate(25) // Very short vibration for manual stop
    }
  }

  // Use a slight delay for smoother transition
  setTimeout(() => {
    if (!isTouching.value && !isHovering.value) {
      isVideoPlaying.value = false
    }
  }, 150)
}

// Handle click events - prevent opening viewer when video is playing
const handleClick = (event: Event) => {
  // On mobile, if video is playing or user is touching, don't open the viewer
  if (isMobile.value && (isVideoPlaying.value || isTouching.value)) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  // Track photo view event in Google Analytics
  gtag('event', 'photo_view', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    has_live_photo: props.photo.isLivePhoto ? 'yes' : 'no',
  })

  // On desktop, always allow opening the viewer
  // Otherwise, open the viewer
  emit('openViewer', props.index)
}

// 智能LivePhoto处理：基于可见性和用户行为
const processLivePhotoWhenVisible = async () => {
  if (
    !props.photo.isLivePhoto ||
    !props.photo.livePhotoVideoUrl ||
    !isVisible.value
  )
    return

  try {
    // 使用优化的转换函数，支持重试和缓存
    const blob = await convertMovToMp4(
      props.photo.livePhotoVideoUrl,
      props.photo.id,
    )

    if (blob) {
      videoBlob.value = blob
      // Clean up previous blob URL
      if (videoBlobUrl.value) {
        URL.revokeObjectURL(videoBlobUrl.value)
      }
      videoBlobUrl.value = URL.createObjectURL(blob)
      isVideoLoaded.value = true

      // 预热视频元素以提高播放性能
      if (videoRef.value) {
        videoRef.value.load()
      }
    }
  } catch (error) {
    console.error('Failed to process LivePhoto:', error)
    // 错误状态会通过processingState反映出来
  }
}

const formatExposureTime = (
  exposureTime: string | number | undefined,
): string => {
  if (!exposureTime) return ''

  let seconds: number

  // Handle different input formats
  if (typeof exposureTime === 'string') {
    // Try to parse fraction format like "1/60"
    if (exposureTime.includes('/')) {
      const parts = exposureTime.split('/')
      if (parts.length === 2 && parts[0] && parts[1]) {
        const numerator = parseFloat(parts[0])
        const denominator = parseFloat(parts[1])
        if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
          seconds = numerator / denominator
        } else {
          return exposureTime // Return original if can't parse
        }
      } else {
        return exposureTime // Return original if format is unexpected
      }
    } else {
      // Try to parse as decimal
      seconds = parseFloat(exposureTime)
      if (isNaN(seconds)) {
        return exposureTime // Return original if can't parse
      }
    }
  } else {
    seconds = exposureTime
  }

  // Convert to fraction format
  if (seconds >= 1) {
    // For exposures 1 second or longer, show as decimal with "s"
    return `${seconds}s`
  } else {
    // For fast exposures, convert to 1/x format
    const denominator = Math.round(1 / seconds)
    return `1/${denominator}`
  }
}

// Set up intersection observer for visibility tracking (LivePhoto 等仅在可见时处理)
// 注意：缩略图加载由 <ThumbImage> 内部的 loading="lazy" + IntersectionObserver 负责，
// isLoading 由它的 @load/@error 事件驱动（模板已绑定），这里不再额外 new Image() 预加载，
// 避免数百张卡片在挂载瞬间同时创建 Image 对象导致主线程阻塞。
onMounted(() => {
  nextTick(() => {
    if (photoRef.value) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const newVisibility = entry.isIntersecting
            if (newVisibility !== isVisible.value) {
              isVisible.value = newVisibility
              emit('visibility-change', {
                index: props.index,
                isVisible: newVisibility,
                date: props.photo.dateTaken || new Date().toISOString(),
              })

              // Process LivePhoto when it becomes visible
              if (newVisibility) {
                nextTick(() => {
                  processLivePhotoWhenVisible()
                })
              }
            }
          })
        },
        {
          threshold: 0.1, // Trigger when 10% of the item is visible
          rootMargin: '50px 0px 50px 0px', // Add some margin for smoother transitions
        },
      )

      observer.observe(photoRef.value)
      intersectionObserverRef.value = observer
    }
  })
})

// Cleanup observers on unmount
onUnmounted(() => {
  if (intersectionObserverRef.value) {
    intersectionObserverRef.value.disconnect()
  }

  // Clean up touch timer
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }

  // Clean up video blob URL
  if (videoBlobUrl.value) {
    URL.revokeObjectURL(videoBlobUrl.value)
  }
})
</script>

<template>
  <div
    ref="photoRef"
    class="photo-card w-full transition-transform duration-300 cursor-pointer select-none"
    :style="{ 'contain-intrinsic-size': `auto ${intrinsicSize}px`, borderRadius: cardRadius }"
    @click="handleClick"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchEnd"
    @contextmenu.prevent=""
  >
    <div
      class="relative group overflow-hidden bg-neutral-900 transition-transform duration-300"
      :style="{ borderRadius: cardRadius }"
    >
      <!-- Container with fixed aspect ratio -->
      <div
        class="w-full relative"
        :style="{ aspectRatio }"
      >
        <ThumbImage
          :src="photo.thumbnailUrl || ''"
          :alt="photo.title || $t('ui.photo.altFallback')"
          :thumbhash="photo.thumbnailHash || ''"
          class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          @load="handleImageLoad"
          @error="handleImageError"
        />

        <!-- LivePhoto video with enhanced motion transition -->
        <motion.video
          v-if="photo.isLivePhoto && videoBlobUrl"
          ref="videoRef"
          :src="videoBlobUrl"
          class="absolute inset-0 w-full h-full object-cover"
          :class="{ 'select-none pointer-events-none': isVideoPlaying }"
          muted
          playsinline
          preload="metadata"
          :initial="{
            opacity: 0,
            scale: 1.02,
          }"
          :animate="{
            opacity: isVideoPlaying ? 1 : 0,
            scale: isVideoPlaying ? 1 : 1.02,
          }"
          :transition="{
            duration: isVideoPlaying ? 0.3 : 0.2,
            ease: isVideoPlaying
              ? [0.23, 1, 0.32, 1]
              : [0.25, 0.46, 0.45, 0.94],
            delay: isVideoPlaying ? 0.05 : 0,
          }"
          @ended="handleVideoEnded"
          @loadeddata="
            () => {
              // 视频加载完成后预热
              if (videoRef && !isVideoPlaying) {
                videoRef.currentTime = 0.1
                videoRef.pause()
              }
            }
          "
        />
      </div>

      <!-- 底部渐变叠加层（Afilmory：独立图层，悬停淡入） -->
      <div
        v-if="!isLoading"
        class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <!-- Live Photo indicator -->
      <PhotoLivePhotoIndicator
        v-if="photo.isLivePhoto"
        class="absolute top-2 left-2"
        :photo="photo"
        :is-video-playing="isVideoPlaying"
        :processing-state="processingState || null"
      />

      <!-- 图片信息与 EXIF 叠加层（Afilmory 精确复刻） -->
      <div
        v-if="!isLoading"
        class="pointer-events-none absolute inset-x-0 bottom-0 p-4 pb-0 text-white"
      >
        <div class="mb-3">
          <h3
            v-if="photo.title"
            class="mb-2 truncate text-sm font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          >
            {{ photo.title }}
          </h3>

          <p
            v-if="photo.description"
            class="mb-2 line-clamp-2 text-sm text-white/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          >
            {{ photo.description }}
          </p>

          <!-- 基本信息：格式 • 宽 × 高 • 大小 -->
          <div
            class="mb-2 flex flex-wrap items-center gap-2 text-xs text-white/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          >
            <span v-if="format">{{ format }}</span>
            <span v-if="format && hasDimensions">•</span>
            <span v-if="hasDimensions" class="whitespace-nowrap">
              {{ photo.width }} × {{ photo.height }}
            </span>
            <span v-if="hasDimensions && sizeText">•</span>
            <span v-if="sizeText" class="whitespace-nowrap">{{ sizeText }}</span>
          </div>

          <!-- Tags -->
          <div v-if="photo.tags?.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="tag in photo.tags"
              :key="tag"
              class="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white/90 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:backdrop-blur-sm"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- EXIF 相机参数网格（常驻显示、恒定高斯模糊，不随悬停隐藏） -->
        <div
          v-if="showExifGrid"
          class="grid grid-cols-2 gap-2 pb-4 text-xs"
        >
          <div
            v-if="photo.exif?.FocalLengthIn35mmFormat"
            class="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:backdrop-blur-sm"
          >
            <Icon
              name="streamline:image-accessories-lenses-photos-camera-shutter-picture-photography-pictures-photo-lens"
              class="shrink-0 text-white/70"
            />
            <span class="text-white/90">{{ photo.exif.FocalLengthIn35mmFormat }}</span>
          </div>
          <div
            v-if="photo.exif?.FNumber"
            class="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:backdrop-blur-sm"
          >
            <Icon name="tabler:aperture" class="shrink-0 text-white/70" />
            <span class="text-white/90">f/{{ photo.exif.FNumber }}</span>
          </div>
          <div
            v-if="photo.exif?.ExposureTime"
            class="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:backdrop-blur-sm"
          >
            <Icon name="material-symbols:shutter-speed" class="shrink-0 text-white/70" />
            <span class="text-white/90">{{ formatExposureTime(photo.exif.ExposureTime) }}</span>
          </div>
          <div
            v-if="photo.exif?.ISO"
            class="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:backdrop-blur-sm"
          >
            <Icon name="carbon:iso-outline" class="shrink-0 text-white/70" />
            <span class="text-white/90">ISO {{ photo.exif.ISO }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 性能：用 content-visibility 跳过屏幕外卡片的绘制（水墙图片高度由 aspectRatio 预留，
   不会引起滚动跳动）；固有高度单张内联按真实长宽比计算（colWidth÷aspectRatio），
   保证首帧视口外卡片以正确高度参与瀑布流排版；此处 320px 仅为极少数缺宽高数据的兜底。
   不再给每张卡强制 will-change/translateZ 常驻合成层，
   否则几百张卡会生成几千个 GPU 图层，滚动时逐层合成导致卡顿。
   悬浮 scale/淡入仅在悬停瞬间由 motion/WAAPI 触发，天然走合成器，无需常驻 will-change。 */
.photo-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
  isolation: isolate;
}
</style>
