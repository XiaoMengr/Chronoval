<script lang="ts" setup>
import { twMerge } from 'tailwind-merge'
import type { CSSProperties } from 'vue'

const props = withDefaults(
  defineProps<{
    src: string
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
  emit('load')
}

const onError = () => {
  isError.value = true
  emit('error')
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
      :src="src"
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

    <div
      v-if="isError"
      class="absolute inset-0 flex justify-center items-center bg-neutral-200 dark:bg-neutral-800"
    >
      <Icon
        name="tabler:photo-off"
        class="size-6 text-neutral-400"
      />
      <p class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        {{ $t('ui.photo.loadError') }}
      </p>
    </div>
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
