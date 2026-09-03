<script lang="ts" setup>
/** Afilmory 风格固定顶部导航栏：fixed top · 玻璃模糊背景 · LinearBlur 渐变遮罩 */
const router = useRouter()
const colorMode = useColorMode()

const isDark = computed({
  get() {
    return colorMode.value === 'dark'
  },
  set(_isDark) {
    colorMode.preference = _isDark ? 'dark' : 'light'
  },
})

const handleOpenLogin = () => {
  router.push('/signin')
}

const { hasActiveFilters, selectedCounts } = usePhotoFilters()

const {
  currentSortLabel,
  currentSortIcon,
  currentSortOption,
  availableSorts,
  setSortOption,
} = usePhotoSort()

const totalSelectedFilters = computed(() => {
  return Object.values(selectedCounts.value).reduce(
    (total, count) => total + count,
    0,
  )
})

// 左侧：头像 + 站点名 + 照片数量
const { photos } = usePhotos()
const avatarUrl = computed(
  () => (getSetting('app:avatarUrl') as string) || '/web-app-manifest-192x192.png',
)
const siteTitle = computed(() => (getSetting('app:title') as string) || '')
const photoCount = computed(() => photos.value?.length ?? 0)

// LinearBlur 渐变模糊遮罩（8 层 backdrop-filter）
const blurLayers = [
  { blur: '48px', from: 0, to: 12.5 },
  { blur: '24px', from: 12.5, to: 25 },
  { blur: '12px', from: 25, to: 37.5 },
  { blur: '8px', from: 37.5, to: 50 },
  { blur: '5px', from: 50, to: 62.5 },
  { blur: '3px', from: 62.5, to: 75 },
  { blur: '2px', from: 75, to: 87.5 },
  { blur: '1px', from: 87.5, to: 100 },
] as const
</script>

<template>
  <header class="fixed top-0 right-0 left-0 z-[100]">
    <!-- LinearBlur 渐变模糊遮罩：mask linear-gradient + backdrop-filter 8 层 -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-16"
      aria-hidden="true"
    >
      <div class="absolute inset-0">
        <div
          v-for="(layer, index) in blurLayers"
          :key="index"
          class="absolute inset-0"
          :style="{
            mask: `linear-gradient(to bottom, rgba(0,0,0,1) ${layer.from}%, rgba(0,0,0,1) ${layer.to}%, rgba(0,0,0,0) ${layer.to}%)`,
            WebkitMask: `linear-gradient(to bottom, rgba(0,0,0,1) ${layer.from}%, rgba(0,0,0,1) ${layer.to}%, rgba(0,0,0,0) ${layer.to}%)`,
            backdropFilter: `blur(${layer.blur})`,
            WebkitBackdropFilter: `blur(${layer.blur})`,
          }"
        />
        <!-- 顶部暗色辉光 -->
        <div
          class="absolute -top-full left-0 size-full"
          :style="{ boxShadow: '0 0 60px rgba(0,0,0,0.6), 0 0 100px rgba(0,0,0,0.6)' }"
        />
      </div>
    </div>

    <!-- 玻璃顶栏 -->
    <div
      class="flex h-12 items-center justify-between gap-2 border-b border-white/10 bg-black/60 px-3 backdrop-blur-xl lg:gap-3 lg:px-4"
    >
      <!-- 左侧：头像 + 站点名 + 照片数量 -->
      <div class="flex min-w-0 items-center gap-2">
        <img
          :src="avatarUrl"
          class="size-7 shrink-0 rounded-lg object-cover lg:size-8"
          :alt="siteTitle"
        />
        <div class="flex min-w-0 items-center gap-1.5">
          <h1 class="truncate text-sm font-semibold text-white lg:text-base">
            {{ siteTitle }}
          </h1>
          <span class="text-xs text-white/40 lg:text-sm">{{ photoCount }}</span>
        </div>
      </div>

      <!-- 右侧/中部：筛选、排序、地图、相册、主题、登录等操作按钮 -->
      <AuthState>
        <template #default="{ loggedIn, clear }">
          <div class="flex items-center gap-1.5 lg:gap-2">
            <div
              class="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5"
            >
              <UTooltip :text="$t('ui.action.globe.tooltip')">
                <UButton
                  variant="ghost"
                  color="neutral"
                  class="cursor-pointer rounded-md bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                  icon="tabler:map-pin-2"
                  size="sm"
                  to="/globe"
                />
              </UTooltip>
              <UTooltip :text="$t('title.albums')">
                <UButton
                  variant="ghost"
                  color="neutral"
                  class="cursor-pointer rounded-md bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                  icon="tabler:photo"
                  size="sm"
                  to="/albums"
                />
              </UTooltip>
              <UPopover>
                <UTooltip :text="$t('ui.action.filter.tooltip')">
                  <UChip
                    inset
                    size="sm"
                    color="info"
                    :show="totalSelectedFilters > 0"
                  >
                    <UButton
                      variant="ghost"
                      :color="hasActiveFilters ? 'info' : 'neutral'"
                      class="cursor-pointer rounded-md bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                      icon="tabler:filter"
                      size="sm"
                    />
                  </UChip>
                </UTooltip>

                <template #content>
                  <UCard variant="glassmorphism">
                    <OverlayFilterPanel />
                  </UCard>
                </template>
              </UPopover>
              <UPopover>
                <UTooltip :text="$t('ui.action.sort.tooltip')">
                  <UButton
                    variant="ghost"
                    :color="
                      currentSortOption?.key === 'dateTaken-desc'
                        ? 'neutral'
                        : 'info'
                    "
                    class="cursor-pointer rounded-md bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                    :icon="currentSortIcon"
                    size="sm"
                  />
                </UTooltip>

                <template #content>
                  <UCard
                    variant="glassmorphism"
                    class="w-3xs"
                  >
                    <template #header>
                      <h3 class="p-1 text-sm font-bold">
                        {{ $t('ui.action.sort.title') }}
                      </h3>
                    </template>

                    <div class="space-y-1">
                      <UButton
                        v-for="sort in availableSorts"
                        :key="sort.key"
                        :variant="
                          currentSortLabel === sort.labelI18n ? 'soft' : 'ghost'
                        "
                        :color="
                          currentSortLabel === sort.labelI18n
                            ? 'info'
                            : 'neutral'
                        "
                        :icon="sort.icon"
                        size="sm"
                        block
                        class="justify-start"
                        @click="setSortOption(sort.key)"
                      >
                        {{ $t(sort.labelI18n) }}
                      </UButton>
                    </div>
                  </UCard>
                </template>
              </UPopover>
              <UTooltip :text="$t('ui.action.theme.tooltip')">
                <UButton
                  variant="ghost"
                  color="neutral"
                  class="cursor-pointer rounded-md bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                  :icon="isDark ? 'tabler:sun' : 'tabler:moon'"
                  size="sm"
                  @click="isDark = !isDark"
                />
              </UTooltip>
            </div>

            <!-- 登录 / 云入口 / 后台 -->
            <UTooltip
              v-if="!loggedIn"
              :text="$t('auth.form.signin.title')"
            >
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                class="cursor-pointer rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                icon="tabler:cloud"
                @click="handleOpenLogin"
              />
            </UTooltip>
            <template v-else>
              <UTooltip :text="$t('ui.action.dashboard.tooltip')">
                <UButton
                  size="sm"
                  color="info"
                  variant="soft"
                  class="cursor-pointer rounded-lg bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                  icon="tabler:dashboard"
                  to="/dashboard"
                />
              </UTooltip>
              <UTooltip :text="$t('ui.action.logout.tooltip')">
                <UButton
                  size="sm"
                  color="error"
                  variant="soft"
                  class="cursor-pointer rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                  icon="tabler:logout"
                  @click="clear"
                />
              </UTooltip>
            </template>
          </div>
        </template>
      </AuthState>
    </div>
  </header>
</template>

<style scoped></style>