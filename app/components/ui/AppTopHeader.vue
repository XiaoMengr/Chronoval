<script lang="ts" setup>
/** Afilmory 风格固定顶部导航栏：fixed top · 玻璃模糊背景 · LinearBlur 渐变遮罩（浅/深双主题自适应） */
const colorMode = useColorMode()

const isDark = computed({
  get() {
    return colorMode.value === 'dark'
  },
  set(_isDark) {
    colorMode.preference = _isDark ? 'dark' : 'light'
  },
})

// 是否在顶栏显示主题切换按钮：由后台设置 app:appearance.themeToggle 控制，
// 默认关闭（取消画廊首页顶栏的浅色/深色切换）。开启后才显示给访客。
const themeToggleEnabled = computed(
  () => !!useSettingRef('app:appearance.themeToggle').value,
)

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

// 顶栏玻璃：单一高斯模糊层，浅色与深色互为反相——
// - 深色：深色近黑毛玻璃 + 白色内容（沉浸）
// - 浅色：明亮白色苹果式毛玻璃 + 深色内容（反相），几无灰感
// 两者使用同一套 blur/saturate 与向下淡出 mask，滚动时照片顺畅从玻璃后穿过。
// 浅色特别提高模糊强度与饱和度、压正白色并以半透叠加出"亮而通透"的 frosted，
// 只让顶部一小段最亮，向下快速淡出，避免与画廊卷面分层。
const glassStyle = computed(() =>
  isDark.value
    ? {
        background: 'rgba(18, 18, 24, 0.45)',
        backdropFilter: 'blur(26px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(26px) saturate(1.3)',
        mask: 'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)',
        WebkitMask:
          'linear-gradient(to bottom, black 0%, black 60%, transparent 100%)',
      }
    : {
        background:
          'linear-gradient(to bottom, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.6) 55%, rgba(255,255,255,0.16) 100%)',
        backdropFilter: 'blur(26px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(26px) saturate(1.3)',
        mask: 'linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.55) 60%, transparent 100%)',
        WebkitMask:
          'linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.55) 60%, transparent 100%)',
      },
)
</script>

<template>
  <header class="fixed top-0 right-0 left-0 z-[100]">
    <!-- 顶栏玻璃：单一高斯模糊层（跟随主题：浅色=柔和浅灰 frosted、深色=沉浸暗玻璃；
         单层避免多层叠加造成"底层又一层透明层/分层"观感；mask 顶部完整、向下自然淡出 -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 z-[-1] h-15"
      aria-hidden="true"
    >
      <div class="absolute inset-0" :style="glassStyle" />
    </div>

    <!-- 内容条：h-11，仅有 LinearBlur 模糊，无背景色块、无分割线（Afilmory 1:1） -->
    <div class="flex h-11 items-center justify-between gap-2 px-3 lg:h-11 lg:gap-3 lg:px-4">
      <!-- 左侧：头像 + 站点名 + 照片数量（跟随主题文字色，浅色下深色可读） -->
      <div class="flex items-center gap-2">
        <img
          :src="avatarUrl"
          class="size-7 rounded-lg object-cover lg:size-8"
          :alt="siteTitle"
        />
        <div class="flex items-center gap-1.5">
          <h1 class="truncate text-sm font-semibold text-(--glass-text) lg:text-base">
            {{ siteTitle }}
          </h1>
          <span class="text-xs text-(--glass-muted) lg:text-sm">{{ photoCount }}</span>
        </div>
      </div>

      <!-- 右侧：操作按钮（保留现有图标，Afilmory 圆形幽灵按钮 + material 胶囊） -->
      <AuthState>
        <template #default="{ loggedIn, clear }">
          <div class="flex items-center gap-1.5 lg:gap-2">
            <!-- 主操作按钮组：Afilmory 圆形幽灵按钮，无胶囊底色（浅色下不出现“透明卡片”） -->
            <div class="flex items-center gap-1">
              <UTooltip :text="$t('ui.action.globe.tooltip')">
                <UButton
                  variant="ghost"
                  color="neutral"
                  class="cursor-pointer rounded bg-transparent text-(--glass-muted) hover:bg-(--glass-hover) hover:text-(--glass-text)"
                  icon="tabler:map-pin-2"
                  size="sm"
                  to="/globe"
                />
              </UTooltip>
              <UTooltip :text="$t('title.albums')">
                <UButton
                  variant="ghost"
                  color="neutral"
                  class="cursor-pointer rounded bg-transparent text-(--glass-muted) hover:bg-(--glass-hover) hover:text-(--glass-text)"
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
                      class="cursor-pointer rounded bg-transparent text-(--glass-muted) hover:bg-(--glass-hover) hover:text-(--glass-text)"
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
                    class="cursor-pointer rounded bg-transparent text-(--glass-muted) hover:bg-(--glass-hover) hover:text-(--glass-text)"
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
                      <h3 class="p-1 text-sm font-bold text-(--glass-text)">
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
              <!-- 主题切换：默认不显示，后台「顶栏显示主题切换按钮」开启后才出现。
                   isDark 依赖 colorMode，SSR 首次渲染与客户端水合结果可能不同，
                   用 ClientOnly 包裹以避免 VNode 水合 class 不匹配告警 -->
              <ClientOnly v-if="themeToggleEnabled">
                <UTooltip :text="$t('ui.action.theme.tooltip')">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    class="cursor-pointer rounded bg-transparent text-(--glass-muted) hover:bg-(--glass-hover) hover:text-(--glass-text)"
                    :icon="isDark ? 'tabler:sun' : 'tabler:moon'"
                    size="sm"
                    @click="isDark = !isDark"
                  />
                </UTooltip>
              </ClientOnly>
            </div>

            <!-- 认证按钮组：Afilmory 圆形幽灵按钮，无胶囊底色（浅色下不出现“透明卡片”） -->
            <div class="flex items-center gap-1">
              <UTooltip
                v-if="!loggedIn"
                :text="$t('auth.form.signin.title')"
              >
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  class="cursor-pointer rounded bg-transparent text-(--glass-muted) hover:bg-(--glass-hover) hover:text-(--glass-text)"
                  icon="tabler:cloud"
                  :to="{ path: '/login' }"
                />
              </UTooltip>
              <template v-else>
                <UTooltip :text="$t('ui.action.dashboard.tooltip')">
                  <UButton
                    size="sm"
                    color="info"
                    variant="soft"
                    class="cursor-pointer rounded bg-transparent text-(--glass-muted) hover:bg-(--glass-hover) hover:text-(--glass-text)"
                    icon="tabler:dashboard"
                    to="/dashboard"
                  />
                </UTooltip>
                <UTooltip :text="$t('ui.action.logout.tooltip')">
                  <UButton
                    size="sm"
                    color="error"
                    variant="soft"
                    class="cursor-pointer rounded bg-transparent text-(--glass-muted) hover:bg-(--glass-hover) hover:text-(--glass-text)"
                    icon="tabler:logout"
                    @click="clear"
                  />
                </UTooltip>
              </template>
            </div>
          </div>
        </template>
      </AuthState>
    </div>
  </header>
</template>

<style scoped>
</style>