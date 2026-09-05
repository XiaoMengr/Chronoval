<script lang="ts" setup>
import type { ScanPhoto } from './scanPhoto'

const props = defineProps<{ photos: ScanPhoto[] }>()
const emit = defineEmits<{ open: [index: number] }>()

// 与首页 MasonryRoot 完全一致的密排列策略：
// 目标列宽 移动 150 / 桌面 250，列数由容器宽度自动派生，最多 8 列
const isMobile = useMediaQuery('(max-width: 768px)')
const TARGET_COL_WIDTH = 250
const TARGET_COL_WIDTH_MOBILE = 150
const MAX_COLUMNS = 8
const MASONRY_GAP = 4
const DEFAULT_ASPECT = 3 / 4

const columnWidth = computed(() =>
  isMobile.value ? TARGET_COL_WIDTH_MOBILE : TARGET_COL_WIDTH,
)

// 增量渲染：首屏只挂载有限数量，接近底部由哨兵追加（与首页一致，避免大图库初始化卡顿）
const INCREMENT_STEP = 100
const renderedCount = ref(0)
const sentinelRef = ref<HTMLElement>()
const loadMoreObserver = ref<IntersectionObserver | null>(null)

const initialRenderedCount = () => {
  const cols = isMobile.value ? 4 : 8
  const rows = isMobile.value ? 8 : 12
  return Math.max(36, cols * rows)
}

const items = computed(() => {
  const list = props.photos
  const end = Math.min(renderedCount.value || 0, list.length)
  return list.slice(0, end).map((photo, index) => ({
    id: photo.id,
    photo,
    originalIndex: index,
  }))
})

const appendBatch = () => {
  if (renderedCount.value >= props.photos.length) return
  renderedCount.value = Math.min(
    renderedCount.value + INCREMENT_STEP,
    props.photos.length,
  )
}

watch(
  () => props.photos,
  (list) => {
    renderedCount.value = list.length
      ? Math.min(initialRenderedCount(), list.length)
      : 0
  },
  { immediate: true },
)

onMounted(() => {
  if (sentinelRef.value) {
    loadMoreObserver.value = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) appendBatch()
      },
      { rootMargin: '1400px 0px 0px 0px', threshold: 0 },
    )
    loadMoreObserver.value.observe(sentinelRef.value)
  }
})

onUnmounted(() => {
  loadMoreObserver.value?.disconnect()
  loadMoreObserver.value = null
})

const aspectOf = (p: ScanPhoto) => p.aspectRatio || DEFAULT_ASPECT
</script>

<template>
  <div>
    <MasonryWall
      :items="items"
      :column-width="columnWidth"
      :gap="MASONRY_GAP"
      :min-columns="1"
      :max-columns="MAX_COLUMNS"
      :ssr-columns="2"
      :key-mapper="
        (_item, _column, _row, index) => items[index]?.originalIndex ?? index
      "
    >
      <template #default="{ item }">
        <button
          :key="item.photo.id"
          type="button"
          class="photo-card group relative block w-full cursor-zoom-in overflow-hidden bg-neutral-900 outline-offset-[-2px] transition-transform duration-300 focus-visible:outline-2 focus-visible:outline-accent"
          :style="{ aspectRatio: aspectOf(item.photo) }"
          :aria-label="item.photo.id"
          @click="emit('open', item.originalIndex)"
        >
          <ThumbImage
            :src="item.photo.thumbnailUrl || ''"
            :fallback-src="item.photo.originalUrl || ''"
            :alt="item.photo.id"
            :thumbhash="item.photo.thumbnailHash || ''"
            class="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105"
          />
        </button>
      </template>
    </MasonryWall>

    <!-- 增量渲染哨兵 -->
    <div
      v-if="renderedCount < (photos?.length ?? 0)"
      ref="sentinelRef"
      class="h-px w-full"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
/* 与首页照片卡一致：只跳过绘制、不常驻合成层，避免大图库滚动卡顿 */
.photo-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
  isolation: isolate;
}
</style>