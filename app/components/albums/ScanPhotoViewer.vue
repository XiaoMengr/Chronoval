<script lang="ts" setup>
import { motion, AnimatePresence } from 'motion-v'
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Navigation, Keyboard, Virtual } from 'swiper/modules'
import type { Swiper as SwiperType } from 'swiper'

import 'swiper/swiper-bundle.css'

import LoadingIndicator from '../photo/LoadingIndicator.vue'
import type { LoadingIndicatorRef } from '../photo/LoadingIndicator.vue'
import ProgressiveImage from '../photo/ProgressiveImage.vue'
import type { ScanPhoto } from './scanPhoto'

interface Props {
  photos: ScanPhoto[]
  currentIndex: number
  isOpen: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  indexChange: [index: number]
}>()

const isMobile = useMediaQuery('(max-width: 768px)')
const swiperRef = ref<SwiperType>()
const loadingIndicatorRef = ref<LoadingIndicatorRef>()
const isZoomed = ref(false)

const currentPhoto = computed(() => props.photos[props.currentIndex])

// 背景模糊图就绪门控：切换图片时先置为未就绪，待新模糊图 @load 后再淡入，
// 避免打开/切换时"黑屏闪断"
const blurReady = ref(false)
watch(
  () => currentPhoto.value?.thumbnailUrl,
  () => {
    blurReady.value = false
  },
)

const { width: viewportW, height: viewportH } = useWindowSize()

// 计算当前图在 object-contain 下的实际显示矩形（宽/高，居中），让两侧高斯模糊
// 紧密贴合图片边缘，不铺满整屏、不过分越界
const displayRect = computed(() => {
  const ar = Math.max(currentPhoto.value?.aspectRatio ?? 1, 0.05)
  const availW = viewportW.value
  const availH = viewportH.value
  let w = availW
  let h = availW / ar
  if (h > availH) {
    h = availH
    w = availH * ar
  }
  return { w, h }
})
// 模糊片在图片矩形基础上外扩 margin，形成"贴着图片边缘的一圈高斯模糊"，
// 颜色随图片本身变化（非黑色）
const blurScale = 1.4
const blurStyle = computed(() => {
  const r = displayRect.value
  const w = r.w * blurScale
  const h = r.h * blurScale
  return {
    left: `${(viewportW.value - w) / 2}px`,
    top: `${(viewportH.value - h) / 2}px`,
    width: `${w}px`,
    height: `${h}px`,
  }
})

// 拍摄时间格式化，与首页查看器工具栏一致
const dayjs = useDayjs()
const currentDateLabel = computed(() => {
  const dt = currentPhoto.value?.dateTaken
  return dt ? dayjs(dt).format('YYYY-MM-DD HH:mm') : null
})

// 打开/关闭时锁定/释放页面滚动（仅客户端；SSR 无 document）
watch(
  () => props.isOpen,
  (open) => {
    if (!import.meta.client) return
    document.body.style.overflow = open ? 'hidden' : ''
    if (!open) isZoomed.value = false
  },
  { immediate: true },
)

// 同步 Swiper 索引
watch(
  () => props.currentIndex,
  (idx) => {
    if (swiperRef.value && swiperRef.value.activeIndex !== idx) {
      swiperRef.value.slideTo(idx, 300)
    }
    isZoomed.value = false
  },
)

const handleSwiperInit = (swiper: SwiperType) => {
  swiperRef.value = swiper
  swiper.allowTouchMove = !isZoomed.value
}

const handleSlideChange = (swiper: SwiperType) => {
  emit('indexChange', swiper.activeIndex)
}

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

// 缩放时禁用滑动，避免手势冲突
watch(isZoomed, (zoomed) => {
  if (swiperRef.value) swiperRef.value.allowTouchMove = !zoomed
})
const handleZoomChange = (zoomed: boolean) => {
  isZoomed.value = zoomed
}

// 当前图片在 WebGL/高清图加载完成后触发的回调：
// 扫描相簿查看器以"模糊图就绪"为主门控淡入，此处仅作为加载完成信号保留即可
const handleImageLoaded = () => {}

// 键盘：Esc 关闭；左右方向键前后切换
const onKeydown = (e: KeyboardEvent) => {
  if (!props.isOpen) return
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowLeft') handlePrevious()
  else if (e.key === 'ArrowRight') handleNext()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

const swiperModules = [Navigation, Keyboard, Virtual]
</script>

<template>
  <Teleport to="body">
    <!-- 背景层：当前图片的高斯模糊大背景（颜色随当前图自适应，100% 不透明遮挡底层页面，
         清晰主图浮在其上层；切换图片时仅更新 src） -->
    <AnimatePresence>
      <motion.div
        v-if="props.isOpen"
        :initial="{ opacity: 1 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.3 }"
        class="fixed inset-0 z-[120] overflow-hidden bg-[#0a0a0e]"
      >
        <!-- 模糊图片本体：尺寸自适应图片显示矩形并略外扩，贴着图片边缘形成一圈高斯模糊，
             颜色随当前图变化（明亮非黑色）；打开/切换时先隐藏，@load 就绪后平滑淡入 -->
        <img
          v-if="currentPhoto?.thumbnailUrl"
          :key="currentPhoto?.id ?? 'empty'"
          :src="currentPhoto.thumbnailUrl"
          alt=""
          aria-hidden="true"
          draggable="false"
          class="absolute object-cover transition-opacity duration-700"
          :class="blurReady ? 'opacity-100' : 'opacity-0'"
          :style="{
            ...blurStyle,
            filter: 'blur(64px) saturate(1.35) brightness(1.05)',
          }"
          @load="blurReady = true"
        />
        <!-- 无缩略图时的兜底深色 -->
        <div v-else class="absolute inset-0 h-full w-full bg-[#0a0a0e]" />
      </motion.div>
    </AnimatePresence>

    <!-- 主内容区域 -->
    <AnimatePresence>
      <motion.div
        v-if="props.isOpen"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.3 }"
        class="fixed inset-0 z-[130] flex items-center justify-center"
        :style="{ touchAction: isMobile ? 'manipulation' : 'none' }"
        @click.self="emit('close')"
      >
        <!-- 顶部工具栏：左=照片标题+拍摄时间，右=关闭；与首页查看器一致，仅去掉分享卡片 -->
        <div
          class="pointer-events-none absolute z-30 flex items-center justify-between gap-3"
          :class="isMobile ? 'top-2 right-2 left-2' : 'top-4 right-4 left-4'"
        >
          <div class="pointer-events-auto flex min-w-0 items-center gap-2">
            <span
              class="truncate rounded-full bg-black/35 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm"
            >
              {{ currentPhoto?.title || `${props.currentIndex + 1} / ${props.photos.length}` }}
            </span>
            <span
              v-if="currentDateLabel"
              class="shrink-0 rounded-full bg-black/35 px-3 py-1 text-xs text-white/70 backdrop-blur-sm"
            >
              {{ currentDateLabel }}
            </span>
          </div>
          <button
            type="button"
            aria-label="close"
            class="pointer-events-auto flex size-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55"
            @click="emit('close')"
          >
            <Icon name="tabler:x" class="size-5" />
          </button>
        </div>

        <!-- 底部计数：n / M，与首页查看器一致 -->
        <div
          class="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 text-xs tabular-nums text-white/80 backdrop-blur-sm"
        >
          {{ props.currentIndex + 1 }} / {{ props.photos.length }}
        </div>

        <LoadingIndicator ref="loadingIndicatorRef" />

        <!-- Swiper：可左右滑动切换 -->
        <Swiper
          :modules="swiperModules"
          :space-between="0"
          :slides-per-view="1"
          :initial-slide="props.currentIndex"
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
            v-for="(photo, index) in props.photos"
            :key="photo.id"
            :virtual-index="index"
            class="flex items-center justify-center"
          >
            <motion.div
              :initial="{ opacity: 0.5, scale: 0.95 }"
              :animate="{ opacity: 1, scale: 1 }"
              :exit="{ opacity: 0, scale: 0.95 }"
              :transition="{ type: 'spring', duration: 0.4, bounce: 0 }"
              class="relative flex h-full w-full items-center justify-center"
              style="user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;"
              @contextmenu.prevent=""
            >
              <!-- 纹理(WebGL)加载：与首页查看器相同的 ProgressiveImage -->
              <ProgressiveImage
                class="h-full w-full object-contain"
                :loading-indicator-ref="loadingIndicatorRef || null"
                :is-current-image="index === props.currentIndex"
                :src="photo.originalUrl || ''"
                :thumbnail-src="photo.thumbnailUrl || ''"
                :thumbhash="photo.thumbnailHash"
                :on-image-loaded="
                  index === props.currentIndex ? handleImageLoaded : undefined
                "
                :enable-pan="index === props.currentIndex"
                :enable-zoom="index === props.currentIndex"
                :on-zoom-change="
                  index === props.currentIndex ? (z) => handleZoomChange(!!z) : undefined
                "
              />
            </motion.div>
          </SwiperSlide>
        </Swiper>

        <!-- 桌面端悬停导航 -->
        <template v-if="!isMobile">
          <button
            v-if="props.currentIndex > 0"
            type="button"
            aria-label="prev"
            class="absolute top-1/2 left-4 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
            @click="handlePrevious"
          >
            <Icon name="tabler:chevron-left" class="size-6" />
          </button>
          <button
            v-if="props.currentIndex < props.photos.length - 1"
            type="button"
            aria-label="next"
            class="absolute top-1/2 right-4 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
            @click="handleNext"
          >
            <Icon name="tabler:chevron-right" class="size-6" />
          </button>
        </template>
      </motion.div>
    </AnimatePresence>
  </Teleport>
</template>

<style scoped>
.swiper {
  width: 100%;
  height: 100%;
}
.swiper-slide {
  text-align: center;
  font-size: 18px;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>