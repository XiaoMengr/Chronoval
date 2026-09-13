<script lang="ts" setup>
import '@/assets/css/heatmap.css'
import type { CalendarItem } from '~/components/ui/CalendarHeatmap/Heatmap'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.dashboard'),
})

const dayjs = useDayjs()
const config = useRuntimeConfig()
const { photos } = usePhotos()

const { data: dashboardStats, refresh: refreshStats } =
  await useFetch('/api/system/stats')

const isLoading = ref(false)

// 年份选择器相关状态
const selectedYear = ref<number | 'recent'>('recent')

const refreshData = async () => {
  isLoading.value = true
  try {
    await refreshStats()
  } finally {
    isLoading.value = false
  }
}

// 后台主页轮询：30s 一次，页面隐藏时暂停、回到前台立即刷新（减少无效请求）
const REFRESH_MS = 30000

let refreshInterval: ReturnType<typeof setInterval> | undefined

const stopPolling = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = undefined
  }
}
const startPolling = () => {
  stopPolling()
  refreshInterval = setInterval(refreshData, REFRESH_MS)
}
const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    refreshData()
    startPolling()
  } else {
    stopPolling()
  }
}

startPolling()
if (import.meta.client) {
  document.addEventListener('visibilitychange', onVisibilityChange)
}

onBeforeUnmount(() => {
  stopPolling()
  if (import.meta.client) {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
})

const systemStatus = computed(() => {
  if (!dashboardStats.value) return 'unknown'

  const memoryUsage = dashboardStats.value.memory
    ? (dashboardStats.value.memory.used / dashboardStats.value.memory.total) *
      100
    : 0

  if (memoryUsage > 90) return 'critical'
  if (memoryUsage > 70) return 'warning'
  return 'healthy'
})

// CPU 负载（0-100）
const cpuLoad = computed(() => dashboardStats.value?.cpu?.current || 0)
const cpuStatus = computed(() => {
  if (cpuLoad.value > 90) return 'critical'
  if (cpuLoad.value > 75) return 'warning'
  return 'healthy'
})

// 存储位置磁盘使用率辅助（用于存储卡片中每个位置的进度条与状态）
type LocationMeta = {
  type: 'local' | 'library'
  path: string
  used: number
  total: number
}

const locPercent = (loc: LocationMeta) => {
  if (!loc.total) return 0
  return Math.round((loc.used / loc.total) * 100)
}
const locStatus = (loc: LocationMeta) => {
  const p = locPercent(loc)
  if (p > 95) return 'critical'
  if (p > 80) return 'warning'
  return 'healthy'
}
const isNetworkProvider = computed(
  () =>
    dashboardStats.value?.storage?.provider &&
    dashboardStats.value.storage.provider !== 'local',
)
const storageLocations = computed<LocationMeta[]>(
  () => dashboardStats.value?.storage?.locations || [],
)

// 获取所有有照片的年份
const availableYears = computed(() => {
  if (!photos.value || photos.value.length === 0) return []

  const years = new Set<number>()
  photos.value.forEach((photo) => {
    if (photo.dateTaken) {
      const year = dayjs(photo.dateTaken).year()
      years.add(year)
    }
  })

  return Array.from(years).sort((a, b) => b - a) // 降序排列，最新年份在前
})

const heatmapData = computed(() => {
  if (!photos.value || photos.value.length === 0) return []

  const dateCountMap = new Map<string, number>()

  // 计算起止范围
  let start, end
  if (selectedYear.value === 'recent') {
    start = dayjs().subtract(1, 'year')
    end = dayjs().add(1, 'day') // 包含今天
  } else {
    start = dayjs(`${selectedYear.value}-01-01`).startOf('year')
    end = dayjs(`${selectedYear.value}-01-01`).endOf('year')
  }

  photos.value.forEach((photo) => {
    if (!photo.dateTaken) return
    const photoDate = dayjs(photo.dateTaken)

    if (photoDate.isBetween(start, end, 'day', '[]')) {
      const date = photoDate.format('YYYY-MM-DD')
      dateCountMap.set(date, (dateCountMap.get(date) || 0) + 1)
    }
  })

  return Array.from(dateCountMap.entries()).map(([date, count]) => ({
    date,
    count,
  }))
})

const heatmapStartDate = computed(() => {
  if (selectedYear.value === 'recent') {
    return dayjs().subtract(1, 'year').toDate()
  }
  return dayjs(`${selectedYear.value}-01-01`).startOf('year').toDate()
})

const heatmapEndDate = computed(() => {
  if (selectedYear.value === 'recent') {
    return dayjs().add(1, 'day').toDate()
  }
  return dayjs(`${selectedYear.value}-01-01`).endOf('year').toDate()
})

const yearOptions = computed(() => {
  const options: Array<{ label: string; value: number | 'recent' }> = [
    {
      label: $t('common.heatmap.legend.recentlyYear'),
      value: 'recent' as const,
    },
  ]

  availableYears.value.forEach((year) => {
    options.push({ label: year.toString(), value: year })
  })

  return options
})

// 最近上传：按拍摄时间倒序取前 8 张（用于缩略图横条）
const RECENT_UPLOADS_LIMIT = 8
const recentUploads = computed<Photo[]>(() =>
  photos.value
    .filter((p) => p.thumbnailUrl)
    .toSorted((a, b) => {
      const ta = a.dateTaken ? new Date(a.dateTaken).getTime() : 0
      const tb = b.dateTaken ? new Date(b.dateTaken).getTime() : 0
      return tb - ta
    })
    .slice(0, RECENT_UPLOADS_LIMIT),
)

// 媒体类型 / 来源分布（图片|视频 × 上传|库映射）
const mediaStats = computed(() => {
  const stats = {
    image: 0,
    video: 0,
    upload: 0,
    library: 0,
    total: photos.value.length,
  }
  for (const p of photos.value) {
    if (p.type === 'video') stats.video += 1
    else stats.image += 1
    if (p.source === 'upload') stats.upload += 1
    else if (p.source === 'library') stats.library += 1
  }
  return stats
})
const mediaTypePercent = (key: 'image' | 'video') => {
  if (!mediaStats.value.total) return 0
  return Math.round((mediaStats.value[key] / mediaStats.value.total) * 100)
}

// 缩略图地址纠错：thumbnailKey 存在时走 /thumb 代理，防止明文 token 泄漏
const thumbSrc = (photo: Photo): string | null => {
  if (!photo.thumbnailUrl) return null
  return photo.thumbnailKey
    ? `/thumb/${encodeURIComponent(photo.thumbnailUrl)}`
    : photo.thumbnailUrl
}

const onShareSite = () => {
  const discussionParams = new URLSearchParams({
    category: 'showcases',
    title: `Show: ${config.public.app.title}`,
    body: `## Description / Motto\n\n${config.public.app.slogan}\n\n## URL\n\n[${window.location.origin}](${window.location.origin})`,
  })
  window.open(
    `https://github.com/HoshinoSuzumi/chronoframe/discussions/new?${discussionParams}`,
    '_blank',
  )
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('dashboard.overview.title')" />
    </template>

    <template #body>
      <div class="flex flex-col gap-6">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardIndicator
            :title="$t('dashboard.overview.indicator.totalPhotos')"
            icon="tabler:photo"
            color="blue"
            :value="dashboardStats?.photos?.total || 0"
            clickable
            @click="$router.push('/dashboard/photos')"
          />
          <DashboardIndicator
            :title="$t('dashboard.overview.indicator.thisMonth')"
            icon="tabler:photo-plus"
            color="green"
            :value="dashboardStats?.photos?.thisMonth || 0"
          />
          <DashboardIndicator
            :title="$t('dashboard.overview.indicator.queueStatus.title')"
            icon="tabler:loader"
            color="purple"
            :value="
              (dashboardStats?.workerPool?.activeWorkers || 0) > 0
                ? $t('dashboard.overview.indicator.queueStatus.processing')
                : $t('dashboard.overview.indicator.queueStatus.pending')
            "
            clickable
            @click="$router.push('/dashboard/queue')"
          />
          <DashboardIndicator
            :title="$t('dashboard.overview.indicator.storageUsage')"
            icon="tabler:database"
            color="blue"
            :value="formatBytes(dashboardStats?.storage?.totalSize || 0)"
          />
        </div>

        <!-- 运行信息 -->
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold pb-1.5">
              {{ $t('dashboard.overview.section.runtimeInfo.title') }}
            </h2>
          </template>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                {{ $t('dashboard.overview.section.runtimeInfo.version') }}
              </p>
              <p class="text-lg font-bold">
                {{ $config.public.VERSION }}
              </p>
            </div>
            <div>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                {{ $t('dashboard.overview.section.runtimeInfo.uptime') }}
              </p>
              <p class="text-lg font-bold">
                {{
                  dashboardStats?.uptime
                    ? $dayjs
                        .duration(dashboardStats.uptime, 'seconds')
                        .humanize()
                    : '-'
                }}
              </p>
            </div>
            <div>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                {{ $t('dashboard.overview.section.runtimeInfo.environment') }}
              </p>
              <UBadge
                :color="
                  dashboardStats?.runningOn === 'docker' ? 'info' : 'success'
                "
                variant="soft"
              >
                {{
                  $t(
                    `dashboard.overview.section.runtimeInfo.systems.${dashboardStats?.runningOn || 'unknown'}`,
                  )
                }}
              </UBadge>
            </div>
            <!-- <div>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ $t('dashboard.overview.section.runtimeInfo.lastUpdate') }}
          </p>
          <p class="text-lg font-bold">
            <ClientOnly>
              {{ $dayjs().fromNow() }}
              <template #placeholder>--</template>
            </ClientOnly>
          </p>
        </div> -->
            <div>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                {{ $t('dashboard.overview.shareSite.label') }}
              </p>
              <p class="text-lg font-bold">
                <UButton
                  external
                  variant="subtle"
                  size="xs"
                  color="info"
                  trailing-icon="tabler:external-link"
                  @click="onShareSite"
                >
                  {{ $t('dashboard.overview.shareSite.button') }}
                </UButton>
              </p>
            </div>
          </div>
        </UCard>

        <!-- 详细统计区域 -->
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <!-- 左侧 -->
          <div class="lg:col-span-3">
            <UCard>
              <div class="heatmap-container">
                <ClientOnly>
                  <CalendarHeatmap
                    theme="blue"
                    :values="heatmapData"
                    :start-date="heatmapStartDate"
                    :end-date="heatmapEndDate"
                    :round="3"
                    :tooltip-formatter="
                      (item: CalendarItem) => {
                        return $t('common.heatmap.tooltip.data', [
                          $dayjs(item.date).format('LL'),
                          item.count || 0,
                        ])
                      }
                    "
                    :tooltip-no-data-formatter="
                      (date: Date) =>
                        $t('common.heatmap.tooltip.noData', [
                          $dayjs(date).format('LL'),
                        ])
                    "
                    :locale="{
                      months: [
                        $t('common.months.jan'),
                        $t('common.months.feb'),
                        $t('common.months.mar'),
                        $t('common.months.apr'),
                        $t('common.months.may'),
                        $t('common.months.jun'),
                        $t('common.months.jul'),
                        $t('common.months.aug'),
                        $t('common.months.sep'),
                        $t('common.months.oct'),
                        $t('common.months.nov'),
                        $t('common.months.dec'),
                      ],
                      days: [
                        $t('common.days.sun'),
                        $t('common.days.mon'),
                        $t('common.days.tue'),
                        $t('common.days.wed'),
                        $t('common.days.thu'),
                        $t('common.days.fri'),
                        $t('common.days.sat'),
                      ],
                      less: $t('common.heatmap.legend.less'),
                      more: $t('common.heatmap.legend.more'),
                    }"
                    :dark-mode="$colorMode.value === 'dark'"
                  >
                    <template #vch__legend-left>
                      <USelectMenu
                        v-model="selectedYear"
                        :items="yearOptions"
                        :disabled="yearOptions.length <= 1"
                        :search-input="false"
                        value-key="value"
                        size="xs"
                        variant="soft"
                        class="w-24"
                      />
                    </template>
                  </CalendarHeatmap>
                  <template #placeholder>
                    <div class="flex items-center justify-center h-[164.5px]">
                      <Icon
                        name="svg-spinners:180-ring-with-bg"
                        class="size-8 opacity-50"
                        mode="svg"
                      />
                    </div>
                  </template>
                </ClientOnly>
              </div>
            </UCard>

            <!-- 最近上传缩略图横条 -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between pb-1.5">
                  <h3 class="font-semibold">
                    {{ $t('dashboard.overview.section.recentUploads.title') }}
                  </h3>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="tabler:arrow-right"
                    :label="$t('dashboard.overview.section.recentUploads.viewAll')"
                    @click="$router.push('/dashboard/photos')"
                  />
                </div>
              </template>

              <ClientOnly>
                <div v-if="recentUploads.length" class="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  <button
                    v-for="photo in recentUploads"
                    :key="photo.id"
                    class="group relative aspect-square w-full overflow-hidden rounded-lg ring-1 ring-black/5 dark:ring-white/10"
                    type="button"
                    @click="$router.push('/dashboard/photos')"
                  >
                    <img
                      v-if="thumbSrc(photo)"
                      :src="thumbSrc(photo)!"
                      :alt="photo.title || ''"
                      loading="lazy"
                      class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                    <div
                      v-else
                      class="flex h-full w-full items-center justify-center bg-neutral-100 dark:bg-neutral-800"
                    >
                      <Icon name="tabler:photo" class="size-5 text-neutral-400" />
                    </div>
                    <div
                      class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity duration-200 group-hover:bg-black/20 group-hover:opacity-100"
                    >
                      <Icon name="tabler:eye" class="size-4 text-white" />
                    </div>
                    <Icon
                      v-if="photo.type === 'video'"
                      name="tabler:player-play-filled"
                      class="absolute left-1.5 top-1.5 size-3.5 text-white/90 drop-shadow"
                    />
                  </button>
                </div>
                <div
                  v-else
                  class="flex items-center justify-center rounded-lg border border-dashed border-neutral-200 py-8 text-xs text-neutral-400 dark:border-neutral-800"
                >
                  {{ $t('dashboard.overview.section.recentUploads.empty') }}
                </div>
                <template #placeholder>
                  <div class="grid grid-cols-4 gap-2 sm:grid-cols-8">
                    <div
                      v-for="n in 8"
                      :key="n"
                      class="aspect-square w-full animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800"
                    ></div>
                  </div>
                </template>
              </ClientOnly>
            </UCard>

            <!-- 类型与来源分布 -->
            <UCard>
              <template #header>
                <h3 class="font-semibold pb-1.5">
                  {{ $t('dashboard.overview.section.mediaTypes.title') }}
                </h3>
              </template>

              <div v-if="mediaStats.total" class="flex items-center gap-5">
                <!-- 类型环图 -->
                <div
                  class="relative size-20 shrink-0 rounded-full"
                  :style="{
                    background: `conic-gradient(var(--ui-primary) 0 ${mediaTypePercent('image')}%, var(--ui-primary-soft) ${mediaTypePercent('image')}% 100%)`,
                  }"
                >
                  <div
                    class="absolute inset-[10px] flex flex-col items-center justify-center rounded-full bg-background dark:bg-neutral-900"
                  >
                    <span class="text-base font-bold leading-none">{{ mediaStats.total }}</span>
                    <span class="mt-0.5 text-[10px] text-neutral-400">张</span>
                  </div>
                </div>

                <!-- 类型 + 来源明细 -->
                <div class="min-w-0 flex-1 space-y-2.5">
                  <div>
                    <div class="flex justify-between text-xs">
                      <span class="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
                        <span class="size-2 rounded-full bg-[var(--ui-primary)]"></span>
                        {{ $t('dashboard.overview.section.mediaTypes.image') }}
                      </span>
                      <span class="tabular-nums text-neutral-500">{{ mediaStats.image }}</span>
                    </div>
                    <div class="mt-1 flex justify-between text-xs">
                      <span class="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
                        <span class="size-2 rounded-full bg-[var(--ui-primary-soft)]"></span>
                        {{ $t('dashboard.overview.section.mediaTypes.video') }}
                      </span>
                      <span class="tabular-nums text-neutral-500">{{ mediaStats.video }}</span>
                    </div>
                  </div>
                  <div class="h-px bg-neutral-100 dark:bg-neutral-800"></div>
                  <div class="space-y-1.5">
                    <div class="flex items-center justify-between text-xs">
                      <span class="text-neutral-500">
                        {{ $t('dashboard.overview.section.mediaTypes.upload') }}
                      </span>
                      <span class="tabular-nums text-neutral-500">{{ mediaStats.upload }}</span>
                    </div>
                    <UProgress
                      :model-value="
                        mediaStats.total
                          ? Math.round((mediaStats.upload / mediaStats.total) * 100)
                          : 0
                      "
                      color="success"
                      size="xs"
                    />
                    <div class="flex items-center justify-between text-xs pt-1.5">
                      <span class="text-neutral-500">
                        {{ $t('dashboard.overview.section.mediaTypes.library') }}
                      </span>
                      <span class="tabular-nums text-neutral-500">{{ mediaStats.library }}</span>
                    </div>
                    <UProgress
                      :model-value="
                        mediaStats.total
                          ? Math.round((mediaStats.library / mediaStats.total) * 100)
                          : 0
                      "
                      color="info"
                      size="xs"
                    />
                  </div>
                </div>
              </div>
              <div
                v-else
                class="rounded-lg border border-dashed border-neutral-200 py-8 text-center text-xs text-neutral-400 dark:border-neutral-800"
              >
                {{ $t('dashboard.overview.section.mediaTypes.empty') }}
              </div>
            </UCard>
          </div>

          <!-- 右侧：系统资源监控 -->
          <div class="lg:col-span-2 w-full space-y-4">
            <!-- 内存使用 -->
            <UCard>
              <template #header>
                <h3 class="font-semibold pb-1.5">
                  {{ $t('dashboard.overview.section.memory.title') }}
                </h3>
              </template>

              <div class="space-y-2">
                <UProgress
                  :model-value="
                    dashboardStats?.memory
                      ? Math.round(
                          (dashboardStats.memory.used /
                            dashboardStats.memory.total) *
                            100,
                        )
                      : 0
                  "
                  :color="
                    systemStatus === 'healthy'
                      ? 'success'
                      : systemStatus === 'warning'
                        ? 'warning'
                        : systemStatus === 'critical'
                          ? 'error'
                          : 'neutral'
                  "
                  class="w-full"
                />
                <div class="flex justify-between text-sm">
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    {{
                      dashboardStats?.memory
                        ? `${Math.round((dashboardStats.memory.used / 1024 / 1024 / 1024) * 100) / 100}GB / ${Math.round((dashboardStats.memory.total / 1024 / 1024 / 1024) * 100) / 100}GB`
                        : $t('dashboard.overview.memoryUnavailable')
                    }}
                  </div>
                  <span>
                    {{
                      dashboardStats?.memory
                        ? Math.round(
                            (dashboardStats.memory.used /
                              dashboardStats.memory.total) *
                              100,
                          )
                        : 0
                    }}%
                  </span>
                </div>
              </div>
            </UCard>

            <!-- CPU 使用 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold pb-1.5">
                {{ $t('dashboard.overview.section.cpu.title') }}
              </h3>
            </template>

            <div class="space-y-2">
              <UProgress
                :model-value="Math.round(cpuLoad * 10) / 10"
                :color="
                  cpuStatus === 'healthy'
                    ? 'success'
                    : cpuStatus === 'warning'
                      ? 'warning'
                      : 'error'
                "
                class="w-full"
              />
              <div class="flex justify-between text-sm">
                <div class="text-xs text-neutral-500 dark:text-neutral-400">
                  {{ $t('dashboard.overview.section.cpu.label') }}
                </div>
                <span>{{ Math.round(cpuLoad * 10) / 10 }}%</span>
              </div>
            </div>
          </UCard>

          <!-- 存储空间 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold pb-1.5">
                {{ $t('dashboard.overview.section.storage.title') }}
              </h3>
            </template>

            <div class="space-y-3">
              <!-- 网络存储提示：内部照片默认存储不在本地磁盘 -->
              <div
                v-if="isNetworkProvider"
                class="flex items-center gap-1.5 rounded-md bg-neutral-50 px-2 py-1.5 text-sm dark:bg-neutral-900"
              >
                <Icon
                  name="tabler:cloud"
                  class="size-4 shrink-0 text-neutral-500 dark:text-neutral-400"
                />
                <span class="text-xs text-neutral-500 dark:text-neutral-400">
                  {{ $t('dashboard.overview.storageNetwork') }}
                </span>
                <UBadge variant="soft" size="sm">
                  {{ dashboardStats?.storage?.provider }}
                </UBadge>
              </div>

              <!-- 无任何位置信息 -->
              <div
                v-if="storageLocations.length === 0"
                class="text-xs text-neutral-500 dark:text-neutral-400"
              >
                {{ $t('dashboard.overview.storageUnavailable') }}
              </div>

              <!-- 遍历展示每个存储位置：内部默认存储 + 外部库 -->
              <div
                v-for="loc in storageLocations"
                :key="loc.path"
                class="space-y-1.5"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 text-sm">
                    <Icon
                      :name="
                        loc.type === 'library'
                          ? 'tabler:folder'
                          : 'tabler:database'
                      "
                      class="size-4 shrink-0 text-neutral-500 dark:text-neutral-400"
                    />
                    <span class="text-xs font-medium">
                      {{
                        loc.type === 'library'
                          ? $t('dashboard.overview.section.storage.library')
                          : $t('dashboard.overview.section.storage.local')
                      }}
                    </span>
                  </div>
                  <span class="text-xs text-neutral-500 dark:text-neutral-400">
                    {{ loc.total ? `${locPercent(loc)}%` : '-' }}
                  </span>
                </div>

                <UProgress
                  :model-value="locPercent(loc)"
                  :color="
                    locStatus(loc) === 'healthy'
                      ? 'success'
                      : locStatus(loc) === 'warning'
                        ? 'warning'
                        : 'error'
                  "
                  class="w-full"
                />

                <div class="flex items-center justify-between text-xs">
                  <span class="truncate text-neutral-500 dark:text-neutral-400" :title="loc.path">
                    {{ loc.path }}
                  </span>
                  <span class="shrink-0 pl-2 text-neutral-500 dark:text-neutral-400">
                    {{ loc.total ? `${formatBytes(loc.used)} / ${formatBytes(loc.total)}` : '-' }}
                  </span>
                </div>
              </div>

              <!-- 照片总占用量 -->
              <div class="flex items-center justify-between border-t border-neutral-100 pt-2 text-sm dark:border-neutral-800">
                <span class="text-xs text-neutral-500 dark:text-neutral-400">
                  {{ $t('dashboard.overview.storagePhotos') }}
                </span>
                <span>{{ formatBytes(dashboardStats?.storage?.totalSize || 0) }}</span>
              </div>
            </div>
          </UCard>

            <!-- 队列详情 -->
            <UCard>
              <template #header>
                <h3 class="font-semibold pb-1.5">
                  {{ $t('dashboard.overview.section.queue.title') }}
                </h3>
              </template>

              <div class="space-y-1">
                <div class="flex justify-between items-center text-sm">
                  <span>
                    {{ $t('dashboard.overview.section.queue.activeWorkers') }}
                  </span>
                  <UBadge variant="soft">
                    {{ dashboardStats?.workerPool?.activeWorkers || 0 }}
                  </UBadge>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span>
                    {{ $t('dashboard.overview.section.queue.totalWorkers') }}
                  </span>
                  <UBadge variant="soft">
                    {{ dashboardStats?.workerPool?.totalWorkers || 0 }}
                  </UBadge>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span>
                    {{ $t('dashboard.overview.section.queue.totalProcessed') }}
                  </span>
                  <UBadge variant="soft">
                    {{ dashboardStats?.workerPool?.totalProcessed || 0 }}
                  </UBadge>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span>
                    {{ $t('dashboard.overview.section.queue.totalFailed') }}
                  </span>
                  <UBadge variant="soft">
                    {{ dashboardStats?.workerPool?.totalErrors || 0 }}
                  </UBadge>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span>
                    {{ $t('dashboard.overview.section.queue.avgSuccessRate') }}
                  </span>
                  <UBadge
                    :color="
                      (dashboardStats?.workerPool?.averageSuccessRate || 0) > 90
                        ? 'success'
                        : (dashboardStats?.workerPool?.averageSuccessRate ||
                              0) > 70
                          ? 'warning'
                          : 'error'
                    "
                    variant="soft"
                  >
                    {{
                      Math.round(
                        dashboardStats?.workerPool?.averageSuccessRate || 0,
                      )
                    }}%
                  </UBadge>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style>
.heatmap-container {
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 100%;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--ui-border-accented, rgba(0, 0, 0, 0.2)) transparent;
}

.heatmap-container::-webkit-scrollbar {
  height: 4px;
}

.heatmap-container::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 2px;
}

.heatmap-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

.heatmap-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

/* 暗色模式下的滚动条样式 */
.dark .heatmap-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

.dark .heatmap-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

.dark .heatmap-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.heatmap-container .vch__container {
  min-width: 720px;
}

.vch__day__label,
.vch__month__label,
.vch__legend {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-500);
}

.vch__day__label,
.vch__month__label {
  font-size: var(--text-xs);
}
</style>
