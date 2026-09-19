<script lang="ts" setup>
/**
 * 瀑布流简约卡片：高度按照片原始长宽比自动适配（适合外部库相簿等无丰富元数据的场景）。
 * 用于「瀑布流」布局。点击触发 open(index)。
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
  columnWidth?: number
}>()

const emit = defineEmits<{ open: [index: number] }>()

const aspectRatio = computed(() => {
  if (props.photo.aspectRatio) return props.photo.aspectRatio
  if (props.photo.width && props.photo.height)
    return props.photo.width / props.photo.height
  return 4 / 3
})

// 给 content-visibility 提供正确固有高度，避免滚动跳动
const intrinsicSize = computed(() => {
  const height = Math.round((props.columnWidth || 280) / aspectRatio.value)
  return Math.max(height, 100)
})
</script>

<template>
  <div
    class="photo-card group relative w-full cursor-zoom-in overflow-hidden bg-neutral-900"
    :style="{ 'contain-intrinsic-size': `auto ${intrinsicSize}px` }"
    @click="emit('open', index)"
  >
    <div class="w-full" :style="{ aspectRatio }">
      <ThumbImage
        :src="photo.thumbnailUrl || photo.originalUrl || ''"
        :fallback-src="photo.originalUrl || ''"
        :alt="photo.id"
        :thumbhash="photo.thumbnailHash || ''"
        class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
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