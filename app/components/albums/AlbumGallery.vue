<script lang="ts" setup>
import type { AlbumLayout } from '~~/shared/types/album'

/**
 * 相簿照片展示容器：负责「瀑布流 / 统一网格 / 时间线」几种布局的骨架与顶部切换控件。
 * 具体卡片由父组件通过具名插槽提供（保留普通相簿丰富的卡片能力）：
 *   - #waterfall-card="{ photo, index }"  瀑布流卡片
 *   - #grid-card="{ photo, index }"       统一网格卡片（时间线分组内复用此卡片）
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
  { value: 'timeline', label: t('albums.layout.timeline') },
]

// —— 时间线分组：按拍摄日期（dateTaken）归类，组内复用网格卡片 ——
const dayjs = useDayjs()

const timelineGroups = computed(() => {
  const order = new Map<string, Array<{ photo: any; index: number }>>()
  for (let i = 0; i < props.photos.length; i++) {
    const photo = props.photos[i]
    const raw = photo?.dateTaken as string | null | undefined
    const key = raw
      ? dayjs(raw).format('YYYY-MM-DD')
      : '__unknown__'
    if (!order.has(key)) order.set(key, [])
    order.get(key)!.push({ photo, index: i })
  }
  // 组间按日期倒序（最新在前），无日期组放最后
  return [...order.entries()]
    .sort((a, b) => {
      if (a[0] === '__unknown__') return 1
      if (b[0] === '__unknown__') return -1
      return b[0] < a[0] ? -1 : 1
    })
    .map(([key, items]) => ({
      key,
      dates: key === '__unknown__' ? null : dayjs(key),
      photos: items,
    }))
})
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
    <div v-else-if="layout === 'immersive'" class="mx-auto flex w-full flex-col gap-4 px-2 sm:px-4">
      <div v-for="(photo, index) in photos" :key="photo.id">
        <slot name="immersive-card" :photo="photo" :index="index" />
      </div>
    </div>

    <!-- 时间线：按拍摄日期分组，组内复用网格卡片 -->
    <div v-else-if="layout === 'timeline'" class="space-y-10">
      <div v-for="group in timelineGroups" :key="group.key" class="space-y-3">
        <!-- 日期头：吸顶便于滚动浏览大分组 -->
        <div class="sticky top-0 z-10 -mx-1 flex items-baseline gap-2 rounded-md bg-white/90 px-1 py-2 backdrop-blur-sm dark:bg-neutral-950/90">
          <span class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {{ group.dates ? group.dates.format('YYYY-MM-DD') : t('albums.layout.unknownDate') }}
          </span>
          <span class="text-xs text-neutral-400 dark:text-neutral-500">
            {{ group.photos.length }} {{ t('albums.layout.photoCount') }}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          <div v-for="item in group.photos" :key="item.photo.id">
            <slot name="grid-card" :photo="item.photo" :index="item.index" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>