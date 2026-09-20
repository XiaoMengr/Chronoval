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

const LAYOUT_OPTIONS: { value: AlbumLayout; label: string; icon: string }[] = [
  // 图标与后台「管理相簿·编辑」的布局选项保持一致
  { value: 'waterfall', label: t('albums.layout.waterfall'), icon: 'tabler:layout-collage' },
  { value: 'grid', label: t('albums.layout.grid'), icon: 'tabler:layout-grid' },
  { value: 'immersive', label: t('albums.layout.immersive'), icon: 'tabler:photo' },
  { value: 'timeline', label: t('albums.layout.timeline'), icon: 'tabler:timeline' },
]

// —— 收缩式布局切换控件 ——
// 单一胶囊元素：收起态显示山体图标 + 照片数；点击后胶囊从中心向左右平滑展开，露出四个布局选项。
const expanded = ref(false)
const switchRoot = ref<HTMLElement | null>(null)
const capsuleRef = ref<HTMLElement | null>(null)
const innerRef = ref<HTMLElement | null>(null)

const collapsedWidth = 88 // 收起态胶囊宽度（山体图标 + 数字）
const expandedWidth = ref(0) // 展开态胶囊宽度（JS 测量）

/** 收起态主胶囊图标：独立使用山体图标 */
const activeIcon = 'tabler:mountain'

// 测量展开态内容的实际宽度
const measureWidth = () => {
  if (innerRef.value) {
    expandedWidth.value = innerRef.value.offsetWidth
  }
}

// 组件挂载后测量展开态宽度
onMounted(() => {
  nextTick(() => measureWidth())
})

// 监听窗口大小变化重新测量
useEventListener('resize', () => {
  measureWidth()
})

const toggleSwitch = () => {
  expanded.value = !expanded.value
}

const pickLayout = (v: AlbumLayout) => {
  layout.value = v
  expanded.value = false
}

// —— 点击面板外部任意区域自动收起 ——
onClickOutside(switchRoot, () => {
  if (expanded.value) expanded.value = false
})

// —— 中心展开动画：容器宽度从收起态平滑过渡到展开态；外层 rounded-full 保证两端始终为圆弧 ——
const capsuleStyle = computed(() => {
  const targetWidth = expanded.value && expandedWidth.value > 0
    ? `${expandedWidth.value}px`
    : `${collapsedWidth}px`
  return {
    width: targetWidth,
    transition: 'width 320ms cubic-bezier(0.33, 1, 0.68, 1)',
    transform: 'translateZ(0)',
    willChange: 'width',
  }
})

// 收起态主按钮：展开时快速淡出，避免与浮现的选项图标在中心叠加闪烁；收拢时等胶囊合拢后淡入
const collapseBtnStyle = computed(() => ({
  transition: expanded.value
    ? 'opacity 90ms ease-out 0ms'
    : 'opacity 200ms ease-out 60ms',
}))

// 展开选项行：展开时山体先快速淡出、选项随即同步淡入（重叠极短，无闪烁无空窗）；收拢时与胶囊合拢同步淡出
const optionsStyle = computed(() => ({
  transition: expanded.value
    ? 'opacity 300ms ease-out 30ms'
    : 'opacity 150ms ease-out 0ms',
}))

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
    .map(([key, items]) => {
      // 组内涉及的展示城市（去重、过滤缺失值），用于"时光线"组头标注
      const citiesSet = new Set<string>()
      for (const { photo } of items) {
        const c = (
          photo?.city ||
          photo?.locationName ||
          photo?.country ||
          ''
        ).trim()
        if (c) citiesSet.add(c)
      }
      return {
        key,
        dates: key === '__unknown__' ? null : dayjs(key),
        photos: items,
        cities: [...citiesSet],
      }
    })
})
</script>

<template>
  <div class="w-full">
    <!-- 顶部切换控件：仅在有照片且需要展示时渲染 -->
    <!-- 单一胶囊：收起态显示山体+数量，点击后胶囊从中心向左右平滑展开，露出四个布局选项 -->
    <div
      v-if="photos.length > 0"
      ref="switchRoot"
      class="relative mb-4 flex h-9 items-center justify-center"
    >
      <!-- 胶囊容器：宽度从收起态平滑过渡到展开态，居中定位，溢出隐藏 -->
      <div
        ref="capsuleRef"
        class="absolute left-1/2 flex h-8 -translate-x-1/2 items-center overflow-hidden rounded-full border border-neutral-200 bg-white/95 shadow-sm will-change-[width] dark:border-neutral-800 dark:bg-neutral-900/95"
        :style="capsuleStyle"
      >
        <!-- 收起态内容：山体图标 + 照片数，居中显示 -->
        <button
          type="button"
          class="absolute inset-0 z-10 flex items-center justify-center gap-2 hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50"
          :style="[
            collapseBtnStyle,
            { opacity: expanded ? 0 : 1 },
            { pointerEvents: expanded ? 'none' : 'auto' },
          ]"
          :title="t('albums.layout.switchLabel')"
          :aria-label="t('albums.layout.switchLabel')"
          :aria-expanded="expanded"
          @click="toggleSwitch"
        >
          <Icon
            :name="activeIcon"
            class="shrink-0 size-4 text-neutral-500 dark:text-neutral-400"
          />
          <span class="text-xs font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">
            {{ photos.length }}
          </span>
        </button>

        <!-- 展开态内容：四个布局选项，每个为独立胶囊，文字图标不挤压，一行契合排列 -->
        <div
          ref="innerRef"
          class="absolute left-1/2 flex h-full -translate-x-1/2 transform-gpu items-center p-1 will-change-transform [backface-visibility:hidden]"
          :class="expanded ? 'opacity-100' : 'opacity-0'"
          :style="optionsStyle"
        >
          <button
            v-for="opt in LAYOUT_OPTIONS"
            :key="opt.value"
            type="button"
            class="group flex h-full shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors duration-200 [backface-visibility:hidden]"
            :class="
              layout === opt.value
                ? 'bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-black'
                : 'text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white'
            "
            :aria-pressed="layout === opt.value"
            @click="pickLayout(opt.value)"
          >
            <Icon
              :name="opt.icon"
              class="size-3.5 shrink-0"
            />
            <span class="shrink-0">
              {{ opt.label }}
            </span>
          </button>
        </div>
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

    <!-- 时光线：按拍摄日期分组，组头标注城市，组内复用网格卡片 -->
    <div v-else-if="layout === 'timeline'" class="space-y-10">
      <div v-for="group in timelineGroups" :key="group.key" class="space-y-3">
        <!-- 日期/城市头：吸顶便于滚动浏览大分组 -->
        <div class="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-white/90 px-1 py-2 backdrop-blur-sm dark:bg-neutral-950/90">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              {{ group.dates ? group.dates.format('YYYY-MM-DD') : t('albums.layout.unknownDate') }}
            </span>
            <span class="text-xs text-neutral-400 dark:text-neutral-500">
              {{ group.photos.length }} {{ t('albums.layout.photoCount') }}
            </span>
          </div>
          <span
            v-for="city in group.cities"
            :key="city"
            class="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          >
            <Icon name="tabler:map-pin" class="size-3" />
            {{ city }}
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

<style scoped>
@keyframes switch-pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.6;
  }
  70% {
    transform: scale(1.35);
    opacity: 0;
  }
  100% {
    transform: scale(1.35);
    opacity: 0;
  }
}
</style>