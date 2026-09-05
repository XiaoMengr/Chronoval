<script lang="ts" setup>
import type { ScanPhoto } from './scanPhoto'

const props = defineProps<{ photos: ScanPhoto[] }>()
const emit = defineEmits<{ open: [index: number] }>()
</script>

<template>
  <!-- 统一宽高比的自适应网格：所有卡片同比例（4:3）、图片 object-cover 铺满，
       各列等高整齐铺满，无错位空位；列数随容器宽度自适应 -->
  <div
    class="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8"
  >
    <button
      v-for="(photo, index) in props.photos"
      :key="photo.id"
      type="button"
      class="photo-card group relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden bg-neutral-900 outline-offset-[-2px] transition-transform duration-300 focus-visible:outline-2 focus-visible:outline-accent"
      :aria-label="photo.id"
      @click="emit('open', index)"
    >
      <ThumbImage
        :src="photo.thumbnailUrl || ''"
        :fallback-src="photo.originalUrl || ''"
        :alt="photo.id"
        :thumbhash="photo.thumbnailHash || ''"
        class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    </button>
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