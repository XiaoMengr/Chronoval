<script setup lang="ts">
import { motion } from 'motion-v'
interface Props {
  photos: Photo[]
  columns?: number | 'auto'
}

const props = withDefaults(defineProps<Props>(), {
  columns: 'auto',
})

const dayjs = useDayjs()
const router = useRouter()

const { filteredPhotos, hasActiveFilters } = usePhotoFilters()
const { sortedPhotos } = usePhotoSort()

const displayPhotos = computed(() => {
  return hasActiveFilters.value ? filteredPhotos.value : sortedPhotos.value
})

const { currentPhotoIndex, isViewerOpen } = storeToRefs(useViewerState())

const FIRST_SCREEN_ITEMS_COUNT = 50
const MASONRY_GAP = 4

// 增量渲染：首屏只挂载有限数量的照片，滚动到接近底部时再逐步追加。
// 避免大图库一次性创建全部卡片（content-visibility 只是跳过绘制，仍需逐张挂载组件），
// 这是进入首页首帧与可交互时间（TBT/INP）的最大瓶颈。
const INCREMENT_INITIAL_VIEWPORT_FACTOR = 1.6
const INCREMENT_STEP = 96
const renderedCount = ref(0)
const sentinelRef = ref<HTMLElement>()
const loadMoreObserver = ref<IntersectionObserver | null>(null)

const hasAnimated = ref(false)
const showFloatingActions = ref(false)
const dateRange = ref<string>()
const visiblePhotos = ref(new Set<number>())

const isMobile = useMediaQuery('(max-width: 768px)')
const { batchProcessLivePhotos } = useLivePhotoProcessor()

const processedBatch = ref(new Set<string>())

// 密排自适应瀑布流（1:1 对齐 Afilmory MasonryView 的列宽与列数策略）：
//   - 目标列宽：移动 150 / 桌面 250
//   - 列数由容器宽度按目标列宽自动派生（vue-masonry-wall 内做最短列填充）
//   - 列通过 flex-grow:1 撑满容器，随宽度自适应增减列数，避免右侧空缺
//   - 桌面端最多 8 列（与 Afilmory maxColumns=8 一致），超出时按宽度均摊列宽
const TARGET_COL_WIDTH = 250
const TARGET_COL_WIDTH_MOBILE = 150
const MAX_COLUMNS = 8

const columnWidth = computed(() => {
  if (props.columns !== 'auto') {
    return 280
  }
  return isMobile.value ? TARGET_COL_WIDTH_MOBILE : TARGET_COL_WIDTH
})

const maxColumns = computed(() => {
  if (props.columns !== 'auto') {
    return props.columns
  }
  return MAX_COLUMNS
})

const minColumns = computed(() => {
  if (props.columns !== 'auto') {
    return props.columns
  }
  return 1
})

// 首屏渲染量：按列数 × 行数 × 视口倍数估算（移动 4 列 / 桌面 8 列），下限 36
const initialRenderedCount = () => {
  const cols = isMobile.value ? 4 : 8
  const rows = isMobile.value ? 8 : 12
  return Math.max(36, Math.ceil(cols * rows * INCREMENT_INITIAL_VIEWPORT_FACTOR))
}

// Prepare items for masonry-wall（只取已"激活"的前 N 张；滚动接近底部由哨兵追加）
const masonryItems = computed(() => {
  const list = displayPhotos.value ?? []
  const end = Math.min(renderedCount.value || 0, list.length)
  return list.slice(0, end).map((photo, index) => ({
    id: photo.id,
    photo,
    originalIndex: index,
  }))
})

// 数据就绪 / 列表变化（筛选、排序、刷新）时，把渲染窗口重置回首屏量。
// 增量追加由底部哨兵负责，避免新一屏数据仍挂着上次滑过的尽头。
watch(
  () => displayPhotos.value,
  (list) => {
    if (!list) return
    renderedCount.value = list.length
      ? Math.min(initialRenderedCount(), list.length)
      : 0
  },
  { immediate: true },
)

// 追加下一批：张开渲染窗口，允许水墙继续向下生长
const appendBatch = () => {
  const total = displayPhotos.value?.length ?? 0
  if (renderedCount.value >= total) return
  renderedCount.value = Math.min(renderedCount.value + INCREMENT_STEP, total)
}

const handleVisibilityChange = ({
  index,
  isVisible,
}: {
  index: number
  isVisible: boolean
  date: string | Date
}) => {
  if (isVisible) {
    visiblePhotos.value.add(index)
  } else {
    visiblePhotos.value.delete(index)
  }
  updateDateRange()

  // Process LivePhotos for visible photos
  nextTick(() => {
    processVisibleLivePhotos()
  })
}

// Process LivePhotos for currently visible photos
const processVisibleLivePhotos = async () => {
  const visiblePhotosArray = Array.from(visiblePhotos.value)
  const livePhotosToProcess = visiblePhotosArray
    .map((index) => displayPhotos.value[index])
    .filter(
      (photo): photo is Photo =>
        photo != null &&
        photo.isLivePhoto === 1 &&
        Boolean(photo.livePhotoVideoUrl) &&
        !processedBatch.value.has(photo.id),
    )

  if (livePhotosToProcess.length === 0) return

  // Mark as processed to avoid reprocessing
  livePhotosToProcess.forEach((photo) => {
    processedBatch.value.add(photo.id)
  })

  // Start background processing
  batchProcessLivePhotos(
    livePhotosToProcess.map((photo) => ({
      id: photo.id,
      livePhotoVideoUrl: photo.livePhotoVideoUrl!,
    })),
  )
}

const visibleCities = ref<string>()

const updateDateRange = () => {
  if (visiblePhotos.value.size === 0) {
    dateRange.value = undefined
    visibleCities.value = undefined
    return
  }

  const visiblePhotosArray = Array.from(visiblePhotos.value)

  // Calculate visible dates
  const visibleDates = visiblePhotosArray
    .map((index) => displayPhotos.value[index]?.dateTaken)
    .filter((date): date is string => Boolean(date))
    .map((date) => dayjs(date))
    .sort((a, b) => (a.isBefore(b) ? -1 : 1))

  // Calculate visible cities
  const cities = visiblePhotosArray
    .map((index) => displayPhotos.value[index]?.city)
    .filter((city): city is string => Boolean(city))

  const uniqueCities = [...new Set(cities)]

  if (uniqueCities.length === 0) {
    visibleCities.value = undefined
  } else if (uniqueCities.length === 1) {
    visibleCities.value = uniqueCities[0]
  } else if (uniqueCities.length <= 3) {
    visibleCities.value = uniqueCities.join('、')
  } else {
    visibleCities.value =
      `${uniqueCities.slice(0, 2).join('、')} ` +
      $t('ui.indexPanelCountCity', { count: uniqueCities.length })
  }

  if (visibleDates.length === 0) {
    dateRange.value = undefined
    return
  }

  const startDate = visibleDates[0]
  const endDate = visibleDates[visibleDates.length - 1]

  if (!startDate || !endDate) {
    dateRange.value = undefined
    return
  }

  // Check if dates are the same day
  if (startDate.isSame(endDate, 'day')) {
    // Same day
    dateRange.value = startDate.format('ll')
  } else if (startDate.isSame(endDate, 'month')) {
    // Same month
    dateRange.value = startDate.format('MMM YYYY')
  } else if (startDate.isSame(endDate, 'year')) {
    // Same year, different months
    dateRange.value = `${startDate.format('MMM')} - ${endDate.format('MMM YYYY')}`
  } else {
    // Different years
    dateRange.value = `${startDate.format('ll')} - ${endDate.format('ll')}`
  }
}

const handleScroll = () => {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  showFloatingActions.value = scrollTop > 500
}

const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })

  // 底部哨兵：滚动接近传感器时，增量追加下一批照片
  if (sentinelRef.value) {
    loadMoreObserver.value = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          appendBatch()
        }
      },
      { rootMargin: '1400px 0px 0px 0px', threshold: 0 },
    )
    loadMoreObserver.value.observe(sentinelRef.value)
  }

  nextTick(() => {
    if (currentPhotoIndex.value) {
      scrollToPhoto(currentPhotoIndex.value)
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  loadMoreObserver.value?.disconnect()
  loadMoreObserver.value = null
})

const handleOpenViewer = (index: number) => {
  router.push(`/${displayPhotos.value[index]?.id}`)
}

const scrollToPhoto = (photoIndex: number) => {
  if (!displayPhotos.value[photoIndex]) return

  const photoId = displayPhotos.value[photoIndex].id

  const performScroll = () => {
    const photoElement = document.querySelector(`[data-photo-id="${photoId}"]`)
    if (!photoElement) return

    const elementRect = photoElement.getBoundingClientRect()
    const windowHeight = window.innerHeight
    const currentScrollY = window.pageYOffset

    // 让图片在视口中央
    const targetScrollY =
      currentScrollY +
      elementRect.top -
      windowHeight / 2 +
      elementRect.height / 2

    window.scrollTo({
      top: Math.max(0, targetScrollY),
      behavior: 'smooth',
    })
  }

  // 若目标照片尚未被增量渲染出来，先张开水墙窗口，待 DOM 就绪后再滚动
  if (photoIndex >= renderedCount.value) {
    renderedCount.value = Math.min(
      photoIndex + INCREMENT_STEP,
      displayPhotos.value.length,
    )
    nextTick(performScroll)
  } else {
    performScroll()
  }
}

watch(currentPhotoIndex, (newIndex) => {
  if (isViewerOpen.value && newIndex >= 0) {
    nextTick(() => {
      scrollToPhoto(newIndex)
    })
  }
})
</script>

<template>
  <div class="relative w-full">
    <!-- 活跃筛选器全宽展示区（Afilmory 风格） -->
    <MasonryActiveFiltersHero v-if="hasActiveFilters" />

    <!-- Afilmory 式浮动操作按钮（仅桌面端显示，移动端右下角隐藏） -->
    <div class="hidden md:block">
      <MasonryFloatingActionButton :show-floating="showFloatingActions" />
    </div>

    <div
      :class="isMobile ? 'pb-1' : ''"
    >
      <div ref="containerRef" class="relative">
        <!-- Masonry Wall -->
        <MasonryWall
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
            <!-- Photo Items -->
            <MasonryItem
              v-if="item.photo && typeof item.originalIndex === 'number'"
              :key="item.photo.id"
              :photo="item.photo"
              :index="item.originalIndex"
              :column-width="columnWidth"
              :has-animated
              :first-screen-items="FIRST_SCREEN_ITEMS_COUNT"
              @visibility-change="handleVisibilityChange"
              @open-viewer="handleOpenViewer($event)"
            />
          </template>
        </MasonryWall>

        <!-- 增量渲染哨兵：接近底部时触发 appendBatch，继续加载更多照片 -->
        <div
          v-if="renderedCount < (displayPhotos?.length ?? 0)"
          ref="sentinelRef"
          class="h-px w-full"
          aria-hidden="true"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 列随容器宽度自适应撑满（vue-masonry-wall 默认 flex-grow:1，Afilmory 观感） */
</style>
