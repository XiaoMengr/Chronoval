<script lang="ts" setup>
/**
 * 沉浸式看图卡片：单列、每张照片占满卡片宽度，高度按原始长宽比自适应。
 * 优先加载原图（沉浸看图要清晰），缩略图仅作失败回退。
 * 向下滚动即可逐张全宽浏览，类似看图软件。
 */
const props = defineProps<{
  photo: {
    id: string
    thumbnailUrl?: string | null
    thumbnailHash?: string | null
    originalUrl?: string | null
    aspectRatio?: number | null
    width?: number | null
    height?: number | null
    [key: string]: any
  }
  index: number
}>()

const emit = defineEmits<{ open: [index: number] }>()

const aspectRatio = computed(() => {
  if (props.photo.aspectRatio) return props.photo.aspectRatio
  if (props.photo.width && props.photo.height)
    return props.photo.width / props.photo.height
  return 4 / 3
})

// 给 content-visibility 提供固有高度，避免滚动跳动
const intrinsicSize = computed(() => {
  // 以桌面端中等内容宽度估算固有高度
  const height = Math.round(720 / aspectRatio.value)
  return Math.max(height, 120)
})
</script>

<template>
  <div
    class="photo-card group relative mx-auto w-full max-w-4xl cursor-zoom-in overflow-hidden rounded-lg bg-neutral-900 ring-1 ring-neutral-900/5 dark:ring-white/5 xl:max-w-5xl 2xl:max-w-6xl"
    :style="{ 'contain-intrinsic-size': `auto ${intrinsicSize}px` }"
    @click="emit('open', index)"
  >
    <div class="flex w-full items-center justify-center sm:max-h-[85vh]" :style="{ aspectRatio }">
      <!-- 沉浸看图：主图为原图，缩略图作为失败回退 -->
      <ThumbImage
        :src="photo.originalUrl || photo.thumbnailUrl || ''"
        :fallback-src="photo.thumbnailUrl || ''"
        :alt="photo.id"
        :thumbhash="photo.thumbnailHash || ''"
        class="absolute inset-0 h-full w-full object-contain"
      />
    </div>
  </div>
</template>

<style scoped>
.photo-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
  isolation: isolate;
}
</style>