<script lang="ts" setup>
import { twMerge } from 'tailwind-merge'
import type { CSSProperties } from 'vue'

const props = withDefaults(
  defineProps<{
    src: string
    /** 缩略图加载失败时的回退地址（如原图）；默认无回退 */
    fallbackSrc?: string | null
    alt: string
    thumbhash?: string | null
    class?: string
    thumbhashClass?: string
    style?: CSSProperties
    threshold?: number | number[]
    rootMargin?: string
    imageContain?: boolean
    lazy?: boolean
  }>(),
  {
    fallbackSrc: null,
    thumbhash: null,
    class: '',
    thumbhashClass: '',
    style: undefined,
    threshold: 0.1,
    rootMargin: '50px',
    imageContain: false,
    lazy: true,
  },
)

const emit = defineEmits<{
  load: []
  error: []
}>()

const elemRef = useTemplateRef('elemRef')
const isElemVisible = ref(false)
const isLoaded = ref(false)
const isError = ref(false)

// 缩略图失败处理：先自动重试一次（容忍瞬时失败），仍失败且有回退地址（如原图）
// 则透明降级到回退地址渲染；最后才落入可手动重试的失败态。
// 重试/回退时给 URL 追加缓存粉碎参数，避免再次命中浏览器缓存的损坏/4xx 响应。
const MAX_AUTO_RETRIES = 1
const attempts = ref(0)
const retryKey = ref(0)
const usedFallback = ref(false)
let retryTimer: ReturnType<typeof setTimeout> | null = null

// 当前实际使用的来源：使用原图(thubnail)或回退(original)
const activeSrc = computed(() =>
  usedFallback.value ? props.fallbackSrc : props.src,
)
const hasFallback = computed(() => Boolean(props.fallbackSrc))

const displayedSrc = computed(() => {
  const s = activeSrc.value
  if (!s) return ''
  if (!retryKey.value) return s
  const sep = s.includes('?') ? '&' : '?'
  return `${s}${sep}t=${Date.now()}_${retryKey.value}`
})

const clearRetryTimer = () => {
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

const retry = () => {
  clearRetryTimer()
  isError.value = false
  retryKey.value++
}

// 无有效 src（空串）不发起请求，直接进入失败态
watch(
  activeSrc,
  (s) => {
    if (!s && !isLoaded.value) {
      isError.value = true
    }
  },
  { immediate: true },
)

// 生命周期结束后不再触发重试
onBeforeUnmount(clearRetryTimer)

onMounted(() => {
  if (!props.lazy) {
    isElemVisible.value = true
  }
})

const { stop } = useIntersectionObserver(
  elemRef,
  ([entry], _observerElement) => {
    isElemVisible.value = entry?.isIntersecting || false
    if (isElemVisible.value) {
      stop()
    }
  },
  {
    threshold: props.threshold,
    rootMargin: props.rootMargin,
    immediate: props.lazy,
  },
)

const onLoaded = () => {
  isLoaded.value = true
  isError.value = false
  attempts.value = 0
  clearRetryTimer()
  emit('load')
}

const onError = () => {
  emit('error')

  // 无有效来源：直接失败态
  if (!activeSrc.value) {
    isError.value = true
    return
  }

  attempts.value++

  // 1) 自动重试一次以容忍瞬时失败
  if (attempts.value <= MAX_AUTO_RETRIES) {
    isError.value = false
    clearRetryTimer()
    retryTimer = setTimeout(() => retry(), 900)
  } else if (!usedFallback.value && hasFallback.value) {
    // 2) 主缩略图持续失败 → 透明降级到回退地址（原图），并清空计数重来
    usedFallback.value = true
    attempts.value = 0
    isError.value = false
    clearRetryTimer()
  } else {
    // 3) 回退也失败（或无回退）→ 保留失败态，等待用户手动重试
    isError.value = true
  }
}
</script>

<template>
  <div
    ref="elemRef"
    :class="twMerge('relative overflow-hidden', $props.class)"
    :style="style"
  >
    <ThumbHash
      v-if="thumbhash && !isLoaded"
      :thumbhash="thumbhash"
      :class="
        twMerge(
          'thumb-blur-placeholder absolute inset-0 scale-110 blur-md brightness-[0.9] saturate-[0.9]',
          thumbhashClass,
        )
      "
    />

    <!-- 占位氛围层仅在"加载完成前"渲染；加载完即卸载，避免每张卡片常驻 backdrop-filter 强制合成层 -->
    <div
      v-if="thumbhash && !isLoaded"
      :class="
        twMerge(
          'thumb-atmosphere absolute inset-0 pointer-events-none',
          isLoaded ? 'thumb-atmosphere--loaded' : 'thumb-atmosphere--loading',
        )
      "
    />

    <img
      v-if="isElemVisible"
      loading="lazy"
      :src="displayedSrc"
      :alt="alt"
      :class="
        twMerge(
          'thumb-img absolute inset-0 w-full h-full',
          imageContain ? 'object-contain' : 'object-cover',
          isLoaded ? 'thumb-img--loaded' : 'thumb-img--loading',
        )
      "
      @load="onLoaded"
      @error="onError"
    />

    <!-- 加载失败：可点按重试（自动重试耗尽后显示） -->
    <button
      v-if="isError"
      type="button"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-pointer bg-neutral-200 dark:bg-neutral-800 outline-offset-[-2px] hover:bg-neutral-300/70 dark:hover:bg-neutral-700/60 transition-colors focus-visible:outline-2 focus-visible:outline-accent"
      :aria-label="$t('ui.photo.retry')"
      @click="retry"
    >
      <Icon name="tabler:photo-off" class="size-6 text-neutral-400" />
      <span class="flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
        <Icon name="tabler:refresh" class="size-3.5" />
        {{ $t('ui.photo.retry') }}
      </span>
    </button>
  </div>
</template>

<style scoped>
/* 真缩略图：加载完成前保持 blur(8px) scale(1.05) 的模糊纹理态，
   加载完成后约 500ms 通过 opacity/transform 平滑过渡到清晰。
   注意不要在此处用 will-change 常驻合成层——水墙上有几百张卡片，
   常驻 will-change/filter/backdrop 会让浏览器为每张卡维护独立 GPU 图层，滚动时逐层合成导致卡顿。 */
.thumb-img {
  transition:
    transform 500ms ease,
    opacity 500ms ease;
}

.thumb-img--loading {
  filter: blur(8px);
  transform: scale(1.05);
  opacity: 0.35;
}

.thumb-img--loaded {
  filter: none;
  transform: scale(1);
  opacity: 1;
}

/* 模糊占位的轻微暗色透明高斯模糊氛围（偏暗中性色，无粉色）。
   占位层仅在加载前渲染、位于纯色卡片底之上，backdrop-filter 在此无观感意义且会强制合成层，故移除。 */
.thumb-blur-placeholder {
  /* no backdrop-filter */
}

.thumb-atmosphere {
  background-color: rgba(8, 9, 12, 0.35);
  transition: opacity 500ms ease;
}

.thumb-atmosphere--loading {
  opacity: 1;
}

.thumb-atmosphere--loaded {
  opacity: 0;
}
</style>
