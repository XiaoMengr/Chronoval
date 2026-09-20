<script lang="ts" setup>
import { motion } from 'motion-v'
import AlbumUnlock from '~/components/albums/AlbumUnlock.vue'

const route = useRoute()
const router = useRouter()
const dayjs = useDayjs()

// 相簿公开标识：可接受的数字 id（兼容存量链接）或不透明 uid，直接交由 API 解析
const albumId = computed(() => route.params.albumId as string)

const {
  data: album,
  error,
  pending,
  refresh,
} = await useFetch(() => `/api/albums/${albumId.value}`, {
  watch: [albumId],
})

if (error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: $t('album.notFound'),
  })
}

const albumData = computed(() => album.value)

// 设置了密码且尚未解锁 → 进入加锁界面
const isLocked = computed(
   () =>
     Boolean(albumData.value?.passwordProtected) &&
     !((albumData.value as any)?.authorized),
 )

const handleAlbumUnlocked = () => {
  refresh()
}

// 相册照片统一按拍摄时间倒序展示（与首页画廊默认排序一致），
// 避免依赖 albumPhotos.position（按配置时的加入顺序、非拍摄时间）导致相册内排序"看起来很乱"。
const sortedAlbumPhotos = computed<Photo[]>(() => {
  const raw = (albumData.value?.photos as Photo[]) ?? []
  const seen = new Set<string>()
  const deduped = raw.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
  return [...deduped].sort((a, b) => {
    const ta = a.dateTaken ? new Date(a.dateTaken).getTime() : 0
    const tb = b.dateTaken ? new Date(b.dateTaken).getTime() : 0
    return tb - ta
  })
})

const albumStats = computed(() => {
  if (!albumData.value) return null

  const photos = albumData.value.photos || []
  const totalPhotos = photos.length
  const photosWithDates = photos.filter((p: any) => p.dateTaken).length
  const photosWithExif = photos.filter((p: any) => p.exif).length

  const allDates = photos
    .map((p: any) => p?.dateTaken)
    .filter((date: any): date is string => Boolean(date))
    .map((date: string) => dayjs(date))
    .sort((a, b) => (a.isBefore(b) ? -1 : 1))

  const dateRange =
    allDates.length > 0
      ? {
          start: allDates[0],
          end: allDates[allDates.length - 1],
        }
      : null

  return {
    total: totalPhotos,
    withDates: photosWithDates,
    withExif: photosWithExif,
    dateRange,
  }
})

// 计算日期范围文本
const dateRangeText = computed(() => {
  const range = albumStats.value?.dateRange
  if (!range || !range.start || !range.end) return null

  if (range.start.isSame(range.end, 'day')) {
    return range.start.format('ll')
  } else if (range.start.isSame(range.end, 'month')) {
    return range.start.format('MMM YYYY')
  } else if (range.start.isSame(range.end, 'year')) {
    return `${range.start.format('MMM')} - ${range.end.format('MMM YYYY')}`
  } else {
    return `${range.start.format('ll')} - ${range.end.format('ll')}`
  }
})

// —— 相簿展示布局（瀑布流 / 统一网格 / 沉浸式看图）——
// 默认取相簿保存的布局；访客可在页顶切换（仅本次浏览生效，不改持久化配置）
const layout = ref<'waterfall' | 'grid' | 'immersive' | 'timeline'>('waterfall')
watch(
  () => (albumData.value as any)?.layout,
  (v) => {
    if (
      v === 'grid' ||
      v === 'waterfall' ||
      v === 'immersive' ||
      v === 'timeline'
    )
      layout.value = v
  },
  { immediate: true },
)

const handleOpenViewer = (index: number) => {
  const photos = sortedAlbumPhotos.value
  if (photos && photos[index]) {
    const { openViewer } = useViewerState()
    const albumRoute = `/albums/${albumId.value}`
    // Scope the viewer to the album's photos so prev/next stays within this album
    // and follows the same chronological order as the rendered masonry.
    openViewer(index, albumRoute, photos as Photo[])
    router.push(`/${photos[index].id}`)
  }
}

const coverPhoto = computed(() => {
  const album = albumData.value
  if (!album?.photos) return null

  // coverPhotoId first
  if (album.coverPhotoId) {
    const cover = sortedAlbumPhotos.value.find((p: any) => p.id === album.coverPhotoId)
    if (cover) return cover
  }

  // otherwise first photo (in chronological order)
  return sortedAlbumPhotos.value[0] || null
})

const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
}

const showFloatingActions = ref(false)

const handleScroll = () => {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  showFloatingActions.value = scrollTop > 500
}

const goBackToAlbums = () => {
  router.push('/albums')
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

onBeforeMount(() => {
  useHead({
    title: albumData.value ? albumData.value.title : $t('album.notFound'),
  })
})
</script>

<template>
  <div class="relative min-h-svh w-full bg-white dark:bg-neutral-950">
    <div
      v-if="pending"
      class="flex flex-col items-center justify-center min-h-[50vh] gap-4"
    >
      <UIcon
        name="tabler:loader"
        class="animate-spin size-8 text-primary-600"
      />
      <p class="text-sm text-neutral-600 dark:text-neutral-400">
        {{ $t('ui.loading') }}
      </p>
    </div>

    <template v-else-if="isLocked">
      <div class="relative min-h-svh w-full">
        <div class="absolute inset-0 h-2/3 overflow-hidden">
          <div
            class="absolute inset-0 bg-gradient-to-b from-white/40 via-white/60 to-white dark:from-neutral-900/30 dark:via-neutral-900/50 dark:to-neutral-900"
          />
        </div>
        <div class="relative container mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <UButton
            variant="ghost"
            color="neutral"
            icon="tabler:arrow-left"
            size="sm"
            @click="goBackToAlbums"
          />
        </div>
        <AlbumUnlock
          :album-id="albumData?.id"
          :title="albumData?.title"
          @success="handleAlbumUnlocked"
        />
      </div>
    </template>

    <template v-else-if="albumData">
      <!-- Backdrop layer -->
      <div
        v-if="coverPhoto"
        class="absolute inset-0 h-2/3 sm:h-[500px] overflow-hidden -z-10"
      >
        <ThumbImage
          :src="coverPhoto.thumbnailUrl || ''"
          :thumbhash="coverPhoto.thumbnailHash"
          :alt="albumData.title"
          class="w-full h-full object-cover opacity-40 dark:opacity-20 scale-110 saturate-150"
        />
        <div
          class="absolute -inset-1 bg-gradient-to-b from-transparent via-white/50 to-white dark:via-neutral-900/50 dark:to-neutral-900 backdrop-blur-xl sm:backdrop-blur-2xl"
        />
      </div>

      <!-- Back Button -->
      <div class="relative container mx-auto px-4 sm:px-6 lg:px-8 pt-4 z-10">
        <UButton
          variant="ghost"
          color="neutral"
          icon="tabler:arrow-left"
          size="sm"
          @click="goBackToAlbums"
        />
      </div>

      <!-- Album Information -->
      <div class="relative container mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-8 z-10">
        <AnimatePresence>
          <motion.div
            class="flex flex-col gap-3"
            :initial="{ opacity: 0, y: 10 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.4 }"
          >
            <!-- title -->
            <div>
              <h1
                class="text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-white tracking-tight"
              >
                {{ albumData.title }}
              </h1>
            </div>

            <!-- metadata -->
            <div class="flex flex-col gap-3">
              <!-- description -->
              <p
                class="text-base text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-2xl"
              >
                {{ albumData.description || $t('album.noDescription') }}
              </p>

              <!-- metadata row -->
              <div class="flex flex-wrap items-center gap-4 text-sm">
                <!-- Photos -->
                <div class="flex items-center gap-1">
                  <Icon
                    name="tabler:photo"
                    class="size-4 -mt-0.5 text-neutral-400 dark:text-neutral-500"
                  />
                  <span class="text-neutral-700 dark:text-neutral-200">
                    <span class="text-neutral-900 dark:text-white">
                      {{ albumStats?.total || 0 }}
                    </span>
                    <span class="text-neutral-500 dark:text-neutral-400 ml-1">
                      {{ $t('album.metadata.photos') }}
                    </span>
                  </span>
                </div>

                <!-- Date Range -->
                <div
                  v-if="dateRangeText"
                  class="flex items-center gap-1"
                >
                  <Icon
                    name="tabler:calendar"
                    class="size-4 -mt-0.5 text-neutral-400 dark:text-neutral-500"
                  />
                  <span class="text-neutral-700 dark:text-neutral-200">
                    {{ dateRangeText }}
                  </span>
                </div>

                <!-- Created -->
                <div
                  class="flex items-center gap-1"
                  :title="$t('album.createdTooltip', { date: $dayjs(albumData.createdAt).format('YYYY-MM-DD HH:mm:ss') })"
                >
                  <Icon
                    name="tabler:clock-plus"
                    class="size-4 -mt-0.5 text-neutral-400 dark:text-neutral-500"
                  />
                  <span class="text-neutral-700 dark:text-neutral-200">
                    {{ $t('album.metadata.created') }}
                    {{ $dayjs(albumData.createdAt).fromNow() }}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <!-- Photos Waterfall or Empty State -->
      <div class="container mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <motion.div
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :transition="{ delay: 0.2, duration: 0.4 }"
        >
          <div
            v-if="albumStats?.total === 0"
            class="flex flex-col items-center justify-center gap-6 px-4"
          >
            <div class="flex flex-col items-center gap-4">
              <Icon
                name="tabler:library-photo"
                class="size-20 text-neutral-300 dark:text-neutral-600"
              />
              <div class="text-center">
                <p
                  class="text-xl font-normal text-neutral-800 dark:text-neutral-200 mb-2"
                >
                  {{ $t('album.emptyAlbumTitle') }}
                </p>
              </div>
            </div>
          </div>

          <AlbumsAlbumGallery
            v-else
            v-model:layout="layout"
            :photos="sortedAlbumPhotos"
            @open-random="handleOpenViewer($event)"
          >
            <template #waterfall-card="{ photo, index }">
              <MasonryItem
                :key="photo.id"
                :photo="photo"
                :index="index"
                :has-animated="false"
                :first-screen-items="50"
                @open-viewer="handleOpenViewer($event)"
              />
            </template>
            <template #grid-card="{ photo, index }">
              <AlbumsAlbumGridCard
                :key="photo.id"
                :photo="photo"
                :index="index"
                @open="handleOpenViewer($event)"
              />
            </template>
            <template #immersive-card="{ photo, index }">
              <AlbumsAlbumImmersiveCard
                :key="photo.id"
                :photo="photo"
                :index="index"
                @open="handleOpenViewer($event)"
              />
            </template>
          </AlbumsAlbumGallery>
        </motion.div>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-col items-center justify-center min-h-[50vh] gap-6">
        <div class="flex flex-col items-center gap-4">
          <Icon
            name="tabler:alert-circle"
            class="size-20 text-red-400"
          />
          <div class="text-center">
            <p
              class="text-2xl font-semibold text-neutral-800 dark:text-neutral-200 mb-2"
            >
              {{ $t('album.failedToLoadTitle') }}
            </p>
            <p
              class="text-base text-neutral-600 dark:text-neutral-400 max-w-md"
            >
              {{ $t('album.failedToLoadDescription') }}
            </p>
          </div>
        </div>
        <UButton @click="goBackToAlbums">
          {{ $t('album.backToAlbums') }}
        </UButton>
      </div>
    </template>

    <!-- Back to Top Button（仅桌面端显示，移动端右下角隐藏） -->
    <motion.div
      v-if="showFloatingActions"
      class="hidden md:block fixed bottom-6 right-6 z-50"
      :initial="{ opacity: 0, scale: 0.8 }"
      :animate="{ opacity: 1, scale: 1 }"
      :exit="{ opacity: 0, scale: 0.8 }"
      :transition="{ duration: 0.2 }"
    >
      <UTooltip :text="$t('ui.action.backtotop.tooltip')">
        <UButton
          variant="soft"
          color="neutral"
          class="cursor-pointer bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm flex justify-center items-center rounded-full shadow-lg hover:bg-white dark:hover:bg-neutral-800 transition-all duration-300 border border-neutral-200/50 dark:border-neutral-700/50"
          icon="tabler:arrow-up"
          size="lg"
          :aria-label="$t('ui.action.backtotop.ariaLabel')"
          @click="scrollToTop"
        />
      </UTooltip>
    </motion.div>
  </div>
</template>

<style scoped></style>
