<script lang="ts" setup>
import type { AlbumLayout } from '~~/shared/types/album'

/**
 * 相簿照片展示容器：负责「瀑布流 / 统一网格」两种布局的骨架与顶部切换控件。
 * 具体卡片由父组件通过具名插槽提供（保留普通相簿丰富的卡片能力）：
 *   - #waterfall-card="{ photo, index }"  瀑布流卡片
 *   - #grid-card="{ photo, index }"       统一网格卡片
 */
const props = defineProps<{
  photos: any[]
  /** 是否展示右上角「样式布局」切换控件（相簿详情默认展示） */
  showSwitch?: boolean
}>()

const layout = defineModel<AlbumLayout>('layout', { default: 'waterfall' })

const { t } = useI18n()

// 瀑布流（沿用原 MasonryWall 配置）
const isMobile = useMediaQuery('(max-width: 768px)')
const MASONRY_GAP = 4
const columnWidth = computed(() => (isMobile.value ? 280 : 280))
const maxColumns = computed(() => (isMobile.value ? 2 : 8))
const minColumns = computed(() => (isMobile.value ? 2 : 2))

const masonryItems = computed(() =>
  props.photos.map((photo, index) => ({ id: photo.id, photo, originalIndex: index })),
)

const LAYOUT_OPTIONS: { value: AlbumLayout; label: string }[] = [
  { value: 'waterfall', label: t('albums.layout.waterfall') },
  { value: 'grid', label: t('albums.layout.grid') },
  { value: 'immersive', label: t('albums.layout.immersive') },
]
</script>

<template>
  <div class="w-full">
    <!-- 顶部切换控件：仅在有照片且需要展示时渲染 -->
    <div
      v-if="photos.length > 0"
      class="mb-4 flex items-center justify-end"
    >
      <div
        class="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/80 p-1 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80"
      >
        <Icon
          name="tabler:layout"
          class="ml-2 size-4 text-neutral-400 dark:text-neutral-500"
          :aria-label="t('albums.layout.switchLabel')"
        />
        <button
          v-for="opt in LAYOUT_OPTIONS"
          :key="opt.value"
          type="button"
          class="cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors"
          :class="
            layout === opt.value
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
              : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100'
          "
          @click="layout = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- 瀑布流 -->
    <MasonryWall
      v-if="layout === 'waterfall'"
      :items="masonryItems"
      :column-width="columnWidth"
      :gap="MASONRY_GAP"
      :min-columns="minColumns"
      :max-columns="maxColumns"
      :ssr-columns="2"
      :key-mapper="
        (_item, _column, _row, index) =>
          masonryItems[index]?.originalIndex ?? index
      "
    >
      <template #default="{ item }">
        <slot
          name="waterfall-card"
          :photo="item.photo"
          :index="item.originalIndex"
        />
      </template>
    </MasonryWall>

    <!-- 统一网格 -->
    <div
      v-else-if="layout === 'grid'"
      class="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8"
    >
      <div v-for="(photo, index) in photos" :key="photo.id">
        <slot name="grid-card" :photo="photo" :index="index" />
      </div>
    </div>

    <!-- 沉浸式看图：单列全幅，向下滚动逐张浏览 -->
    <div v-else class="mx-auto flex w-full flex-col gap-4 px-2 sm:px-4">
      <div v-for="(photo, index) in photos" :key="photo.id">
        <slot name="immersive-card" :photo="photo" :index="index" />
      </div>
    </div>
  </div>
</template>

<style scoped></style>