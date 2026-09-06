<script setup lang="ts">
import { WebGLImageViewer } from '@chronoframe/webgl-image'
import type { LoadingIndicatorRef } from './LoadingIndicator.vue'
import type { ImageLoaderManager } from '~/libs/image-loader-manager'

interface Props {
  src: string
  thumbnailSrc?: string
  thumbhash?: string | null
  /** 是否渲染"缩略图占位"（其自带的 blur(8px)→清晰 会与 WebGL 构建纹理的 blur→清晰叠加成两次模糊）。
   * 桌面端关闭该占位，只保留 WebGL 构建纹理这一次从模糊到清晰；移动端保留占位作加载兜底 */
  showThumbPlaceholder?: boolean
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
  /** 纹理（WebGL）构建成功、首帧已绘制并浮现后回调，用于父级按「加载完成」门控附属控件显隐 */
  onTextureReady?: () => void
  isLivePhoto?: boolean
  livePhotoVideoUrl?: string
  isHDR?: boolean
  /** 变化时对当前 WebGL 图像重新适配/居中，用于布局尺寸变化（如信息面板折叠）后修正渲染 */
  refitKey?: number
}

const props = withDefaults(defineProps<Props>(), {
  enablePan: true,
  enableZoom: true,
  isCurrentImage: true,
  thumbnailSrc: '',
  thumbhash: null,
  showThumbPlaceholder: true,
  alt: 'Image',
  width: undefined,
  height: undefined,
  className: '',
  onProgress: undefined,
  onError: undefined,
  onZoomChange: undefined,
  onBlobSrcChange: undefined,
  onImageLoaded: undefined,
  onTextureReady: undefined,
  isLivePhoto: false,
  livePhotoVideoUrl: '',
  isHDR: false,
})

// 布局尺寸变化（如信息面板折叠）后，图片舞台宽度变化：
// 若 WebGL 引擎已就绪则仅重新适配/居中渲染；若引擎因挂载失败未就绪（engine 为空，resetView 是空操作），
// 则通过自增 key 重建 WebGL 查看器以重试挂载，避免图片停留在模糊占位
const webglMountKey = ref(0)
watch(
  () => props.refitKey,
  () => {
    nextTick(() => {
      if (showWebGLViewer.value && !webglReady.value) {
        webglMountKey.value++
      } else {
        webglViewerRef.value?.resetView()
      }
    })
  },
)

const containerRef = ref<HTMLDivElement>()

const highResLoaded = ref(false)
const highResRendered = ref(false)
const hasError = ref(false)
const currentSrc = ref<string | null>()
// 首帧门控：WebGL 引擎在解码/上传纹理前画布可能短暂呈黑色（分块首帧）。
// 收到引擎「加载完成（首帧已绘制）」前保持图层隐藏，就绪后再淡入，避免进入查看器时黑屏闪烁。
const webglReady = ref(false)

// 「构建纹理」细节指示：从 0.3 过渡到 0.9（近清晰），随后淡出，不显示终值 x1.0，
// 贴合图片左上角自适应显示，让切换照片时的模糊→清晰过渡有实时数值反馈
const detailLevel = ref(0.3)
const showDetail = ref(false)
let sharpenTimer: ReturnType<typeof setInterval> | null = null
let sharpening = false
const startSharpen = () => {
  if (sharpenTimer) clearInterval(sharpenTimer)
  detailLevel.value = 0.3
  showDetail.value = true
  if (sharpening) return
  sharpening = true
  let d = 0.3
  // 从模糊到清晰：数值到 0.9 即视为接近清晰，随后淡出，不显示终值 x1.0
  const MAX = 0.9
  sharpenTimer = setInterval(() => {
    d = Math.min(MAX, d + 0.06)
    detailLevel.value = Math.round(d * 10) / 10
    if (d >= MAX) {
      if (sharpenTimer) clearInterval(sharpenTimer)
      sharpenTimer = null
      sharpening = false
      setTimeout(() => {
        showDetail.value = false
      }, 200)
    }
  }, 34)
}
const stopSharpenTimer = () => {
  if (sharpenTimer) {
    clearInterval(sharpenTimer)
    sharpenTimer = null
  }
  sharpening = false
}

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
    props.onTextureReady?.()
    startSharpen()
  }
}

// 兜底门控：个别图片引擎的「就绪事件」可能偶尔未触发，导致画布一直 hidden，
// 而此时缩略图又已淡出，视觉上只看到背景模糊层、图片像「躲在模糊层下一层」。
// 只要高清图已在 WebGL 中真正渲染出帧（highResRendered=true），就强制把它置为就绪浮现。
watch(
  () => highResRendered.value,
  (rendered) => {
    if (rendered && showWebGLViewer.value && !webglReady.value) {
      webglReady.value = true
      props.onTextureReady?.()
      startSharpen()
    }
  },
)

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
  stopSharpenTimer()
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full h-full flex items-center justify-center"
  >
    <!-- 缩略图占位 (高清图渲染后淡出)。桌面端经 showThumbPlaceholder=false 关闭，
          避免其 blur(8px)→清晰 与 WebGL 构建纹理 blur→清晰 叠加成两次模糊 -->
    <ThumbImage
      v-if="props.showThumbPlaceholder && props.thumbnailSrc"
      :src="thumbnailSrc"
      :thumbhash="thumbhash"
      :alt="alt || $t('ui.photo.altFallback')"
      class="absolute inset-0 w-full h-full object-contain transition-opacity duration-500"
      :class="thumbnailDimmed ? 'opacity-0 pointer-events-none' : ''"
      thumbhash-class="opacity-50"
      image-contain
    />

    <!-- 「构建纹理」细节指示：模糊→清晰期间在舞台左下角显示 0.3→0.9（纯文本读数，无胶囊背景，
          贴合图片，仅加轻微投影保证任何背景下都可读），随后淡出（无终值 x1.0） -->
    <Transition name="detail-pop">
      <div
        v-if="showDetail && !isLivePhoto"
        class="detail-indicator pointer-events-none absolute z-20"
      >
        <span
          class="font-mono text-sm tabular-nums text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]"
        >
          x{{ detailLevel.toFixed(1) }}
        </span>
      </div>
    </Transition>

    <!-- WebGL 图片查看器 (首帧就绪后淡入且从模糊到清晰，避免黑屏) -->
    <div
      v-if="showWebGLViewer"
      :class="[
        'absolute inset-0 w-full h-full',
        webglReady ? 'webgl-viewer-in' : 'webgl-viewer-hidden',
      ]"
    >
      <WebGLImageViewer
        :key="webglMountKey"
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
/* 首帧门控：引擎绘制完成前保持隐藏，就绪后平滑淡入并从模糊到清晰，避免黑屏闪烁 */
.webgl-viewer-hidden {
  opacity: 0;
}

.webgl-viewer-in {
  animation:
    chrono-viewer-in 260ms ease-out both,
    chrono-sharpen 460ms ease-out both;
  will-change: opacity, filter;
}

@keyframes chrono-viewer-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 纹理清晰化：从高斯模糊过渡到清晰，模拟「构建纹理中从小图到大图」 */
@keyframes chrono-sharpen {
  from {
    filter: blur(18px);
  }
  to {
    filter: blur(0px);
  }
}

/* 细节指示器淡入/淡出 */
.detail-pop-enter-active,
.detail-pop-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s ease;
}

.detail-pop-enter-from,
.detail-pop-leave-to {
  opacity: 0;
  transform: scale(0.94);
}

/* 指示器定位：首页画廊 / 相簿 / 扫描查看器共用同一 ProgressiveImage，样式一致。
   固定在舞台左下角内侧（与首页一致）；移动端自适应抬高，避开底部进度条/控件区与安全区 */
.detail-indicator {
  left: 16px;
  bottom: 24px;
}

@media (max-width: 767px) {
  .detail-indicator {
    bottom: calc(env(safe-area-inset-bottom, 0px) + 72px);
  }
}
</style>
