<script setup lang="ts">
import { WebGLImageViewer } from '@chronoframe/webgl-image'
import type { LoadingIndicatorRef } from './LoadingIndicator.vue'
import type { ImageLoaderManager } from '~/libs/image-loader-manager'

interface Props {
  src: string
  thumbnailSrc?: string
  thumbhash?: string | null
  alt?: string
  width?: number
  height?: number
  className?: string
  enablePan?: boolean
  enableZoom?: boolean
  isCurrentImage?: boolean
  loadingIndicatorRef: LoadingIndicatorRef | null
  onProgress?: (progress: number) => void
  onError?: () => void
  onZoomChange?: (isZoomed: boolean, level?: number) => void
  onBlobSrcChange?: (blobSrc: string | null) => void
  onImageLoaded?: () => void
  isLivePhoto?: boolean
  livePhotoVideoUrl?: string
  isHDR?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  enablePan: true,
  enableZoom: true,
  isCurrentImage: true,
  thumbnailSrc: '',
  thumbhash: null,
  alt: 'Image',
  width: undefined,
  height: undefined,
  className: '',
  onProgress: undefined,
  onError: undefined,
  onZoomChange: undefined,
  onBlobSrcChange: undefined,
  onImageLoaded: undefined,
  isLivePhoto: false,
  livePhotoVideoUrl: '',
  isHDR: false,
})

const containerRef = ref<HTMLDivElement>()

const highResLoaded = ref(false)
const highResRendered = ref(false)
const hasError = ref(false)
const currentSrc = ref<string | null>()
// 首帧门控：WebGL 引擎在解码/上传纹理前画布可能短暂呈黑色（分块首帧）。
// 收到引擎「加载完成（首帧已绘制）」前保持图层隐藏，就绪后再淡入，避免进入查看器时黑屏闪烁。
const webglReady = ref(false)

const { loggedIn } = useUserSession()
const webglImageViewerDebug = useSettingRef('system:webglImageViewerDebug')
const isDev = computed(() => import.meta.env.DEV)
const showDebugInfo = computed(() => {
  if (webglImageViewerDebug.value === true) {
    return !!loggedIn.value
  }

  return isDev.value && import.meta.env.VITE_SHOW_DEBUG_INFO === 'true'
})

// 使用 WebGLImageViewer 的引用
const webglViewerRef = ref()
const loaderManagerRef = ref<ImageLoaderManager | null>(null)

// 当高清图已在 WebGL 中渲染时，将占位缩略图淡出（置灰且不拦截交互）
const thumbnailDimmed = computed(() => {
  return props.thumbnailSrc && highResRendered.value && !hasError.value
})

const showWebGLViewer = computed(() => {
  return (
    highResLoaded.value &&
    currentSrc.value &&
    props.isCurrentImage &&
    !hasError.value
  )
})

const loadImage = () => {
  loaderManagerRef.value = useImageLoader(
    props.src,
    props.isCurrentImage,
    highResLoaded.value,
    hasError.value,
    props.loadingIndicatorRef,
    props.onProgress,
    props.onError,
    (src) => (currentSrc.value = src),
    (loaded) => (highResLoaded.value = loaded),
    (error) => (hasError.value = error),
    (rendered) => (highResRendered.value = rendered),
    props.onImageLoaded,
  )
}

// 监听 isCurrentImage 的变化，当变为 true 时触发图片加载
watch(
  () => props.isCurrentImage,
  (isCurrent, wasCurrent) => {
    if (!isCurrent && wasCurrent) {
      // 当图片不再是当前图片时，中断加载
      loaderManagerRef.value?.cleanup()
      loaderManagerRef.value = null
    } else if (
      isCurrent &&
      !wasCurrent &&
      !highResLoaded.value &&
      !hasError.value
    ) {
      // 当图片变为当前图片且尚未加载高分辨率图片时，触发加载
      loadImage()
    }
  },
  { immediate: false },
)

// 监听 src 的变化，当源地址改变时重置状态并重新加载
watch(
  () => props.src,
  (newSrc, oldSrc) => {
    if (newSrc !== oldSrc) {
      // 中断之前的加载
      loaderManagerRef.value?.cleanup()
      loaderManagerRef.value = null

      // 重置状态
      highResLoaded.value = false
      highResRendered.value = false
      hasError.value = false
      currentSrc.value = null
      webglReady.value = false

      // 如果是当前图片，立即开始加载
      if (props.isCurrentImage) {
        loadImage()
      }
    }
  },
  { immediate: false },
)

// 初始加载
loadImage()

const handleWebGLStateChange = useWebGLWorkState(props.loadingIndicatorRef)

// 同时驱动加载指示器与首帧门控：仅在引擎报告加载完成（首帧已绘制）后淡入显示，
// 隐藏加载前画布的黑色首帧，避免进入/切换时黑屏闪烁
const handleWebGLState = (
  isLoading: boolean,
  state?: unknown,
  quality?: 'high' | 'medium' | 'low' | 'unknown',
) => {
  handleWebGLStateChange(isLoading, state, quality)
  if (!isLoading) {
    webglReady.value = true
  }
}

// 处理缩放状态变化
const handleZoomChange = (originalScale: number, relativeScale: number) => {
  const isZoomed = relativeScale > 1.1 // 认为缩放超过 1.1 倍算作缩放状态
  if (props.onZoomChange) {
    props.onZoomChange(isZoomed, Math.round(originalScale * 10) / 10) // 传递绝对倍率并保留一位小数
  }
}

// 组件卸载时清理
onUnmounted(() => {
  loaderManagerRef.value?.cleanup()
  loaderManagerRef.value = null
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full h-full flex items-center justify-center"
  >
    <!-- 缩略图 (占位, 高清图渲染后淡出) -->
    <ThumbImage
      v-if="props.thumbnailSrc"
      :src="thumbnailSrc"
      :thumbhash="thumbhash"
      :alt="alt || $t('ui.photo.altFallback')"
      class="absolute inset-0 w-full h-full object-contain transition-opacity duration-500"
      :class="thumbnailDimmed ? 'opacity-0 pointer-events-none' : ''"
      thumbhash-class="opacity-50"
      image-contain
    />

    <!-- WebGL 图片查看器 (首帧就绪后淡入，避免黑屏) -->
    <div
      v-if="showWebGLViewer"
      :class="[
        'absolute inset-0 w-full h-full',
        webglReady ? 'webgl-viewer-in' : 'webgl-viewer-hidden',
      ]"
    >
      <WebGLImageViewer
        ref="webglViewerRef"
        :src="currentSrc!"
        :class="className"
        class="w-full h-full"
        :width="width"
        :height="height"
        :center-on-init="true"
        :limit-to-bounds="true"
        :smooth="true"
        :min-scale="1"
        :max-scale="12"
        :wheel="{ step: 0.2, wheelDisabled: false, touchPadDisabled: false }"
        :pinch="{ step: 0.2 }"
        :double-click="{ mode: 'toggle', step: 2.4, animationTime: 400 }"
        :panning="{ velocityDisabled: false }"
        :debug="showDebugInfo"
        @zoom-change="handleZoomChange"
        @loading-state-change="handleWebGLState"
      />
    </div>

    <!-- 错误状态 -->
    <div
      v-if="hasError"
      class="flex flex-col items-center justify-center text-white/70 gap-2"
    >
      <Icon
        name="tabler:photo-off"
        class="w-12 h-12"
      />
      <p class="text-sm">{{ $t('photo.image.loadError') }}</p>
    </div>
  </div>
</template>

<style scoped>
/* 首帧门控：引擎绘制完成前保持隐藏，就绪后平滑淡入，避免进入查看器时黑屏闪烁 */
.webgl-viewer-hidden {
  opacity: 0;
}

.webgl-viewer-in {
  animation: chrono-viewer-in 260ms ease-out both;
  will-change: opacity;
}

@keyframes chrono-viewer-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
