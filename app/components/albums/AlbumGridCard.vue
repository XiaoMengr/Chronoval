<script lang="ts" setup>
/**
 * 统一网格卡片：固定 4:3 宽高比、图片 object-cover 铺满，各卡片等高整齐排列。
 * 用于「统一网格」布局。点击触发 open(index)。
 */
defineProps<{
  photo: {
    id: string
    thumbnailUrl?: string | null
    thumbnailHash?: string | null
    originalUrl?: string | null
    [key: string]: any
  }
  index: number
}>()

const emit = defineEmits<{ open: [index: number] }>()
</script>

<template>
  <button
    type="button"
    class="photo-card group relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden bg-neutral-900 outline-offset-[-2px] transition-transform duration-300 focus-visible:outline-2 focus-visible:outline-accent"
    :aria-label="photo.id"
    @click="emit('open', index)"
  >
    <ThumbImage
      :src="photo.thumbnailUrl || photo.originalUrl || ''"
      :fallback-src="photo.originalUrl || ''"
      :alt="photo.id"
      :thumbhash="photo.thumbnailHash || ''"
      class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
    />
  </button>
</template>

<style scoped>
/* 性能：跳过屏幕外卡片绘制，避免大图库滚动卡顿 */
.photo-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
  isolation: isolate;
}
</style>