<script setup lang="ts">
import dayjsLocale_zhCN from 'dayjs/locale/zh-cn'
import dayjsLocale_zhTW from 'dayjs/locale/zh-tw'
import dayjsLocale_zhHK from 'dayjs/locale/zh-hk'

const router = useRouter()
const dayjs = useDayjs()
const colorMode = useColorMode()
const localeRef = ref('en')
try {
  const { locale } = useI18n()
  watch(
    locale,
    (value) => {
      localeRef.value = value
    },
    { immediate: true },
  )
} catch {
  // i18n context may be unavailable during early server-side error rendering
}

// 初始化设置系统 - 一次性加载所有设置
const settingsStore = useSettingsStore()
await settingsStore.initSettings()

const appTitle = useSettingRef('app:title')

// 主题持久化修复：优先尊重浏览器已保存的配色选择（顶栏切换后 Nuxt ColorMode
// 会写入 cframe-color-mode）。仅当用户从未显式选择过浅/暗色时，才用服务端设置的
// 默认主题兜底。此前无条件覆盖导致首页切换主题后一旦刷新就被服务端默认值打回浅色。
if (import.meta.client) {
  let storedTheme: string | null = null
  try {
    storedTheme = window.localStorage.getItem('cframe-color-mode')
  } catch {
    storedTheme = null
  }
  colorMode.preference =
    storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : (useSettingRef('app:appearance.theme').value as string)
}

useHead({
  titleTemplate: (title) =>
    `${title ? title + ' | ' : ''}${appTitle.value || 'Chronoval'}`,
})

// 根据用户登录状态和当前路由决定使用哪个 API
// 登录用户或后台管理页面显示所有照片，未登录用户在前端页面只显示可见照片
const route = useRoute()
const { loggedIn } = useUserSession()
const apiEndpoint = computed(() => {
  // 后台管理页面始终显示所有照片
  if (route.path.startsWith('/dashboard')) {
    return '/api/photos'
  }
  // 前端画廊：设为「相簿」的扫描库照片始终不显示（未登录走 /visible，
  // 登录走 /api/photos?gallery=1，均已排除相簿扫描库）。
  return loggedIn.value ? '/api/photos?gallery=1' : '/api/photos/visible'
})
const { data, refresh, status } = await useFetch(() => apiEndpoint.value, {
  watch: [apiEndpoint],
})

const photos = computed(() => (data.value as Photo[]) || [])

const { switchToIndex, closeViewer, clearReturnRoute } = useViewerState()
const {
  currentPhotoIndex,
  isViewerOpen,
  returnRoute,
  isDirectAccess,
  scopedPhotos,
} = storeToRefs(useViewerState())

// 从画廊查看器跳转到系统页面（如后台 /dashboard）时主动关闭查看器。
// 查看器是 Teleport 到 body 的全屏覆盖层（z-50，固定在照片上方），若停留在打开态，
// 会挡在后台页之上导致"点了没反应"；且其 direct-access 关闭逻辑（handleClose）会把
// 用户再弹回首页，造成"跳转变成回家"的间歇性行为。进入后台前先关掉并复位即可。
watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/dashboard') && isViewerOpen.value) {
      closeViewer()
    }
  },
)

// The photo collection the viewer actually navigates: the scoped list (e.g. an
// album) when present, otherwise the global list.
const viewerPhotos = computed(() => scopedPhotos.value ?? photos.value)

const handleIndexChange = (newIndex: number) => {
  switchToIndex(newIndex)
  router.replace(`/${viewerPhotos.value[newIndex]?.id}`)
}

const handleClose = () => {
  closeViewer()

  // 如果是直接访问详情页面，关闭时返回首页
  if (isDirectAccess.value) {
    isDirectAccess.value = false
    router.replace('/')
  } else if (returnRoute.value) {
    // 如果有指定的返回路由，返回到该路由
    const destination = returnRoute.value
    clearReturnRoute()
    router.replace(destination)
  } else {
    // 否则使用历史记录或默认返回首页
    if (window.history.length > 1) {
      router.back()
    } else {
      router.replace('/')
    }
  }
}

watchEffect(() => {
  dayjs.locale('zh-Hans', dayjsLocale_zhCN)
  dayjs.locale('zh-Hant-TW', dayjsLocale_zhTW)
  dayjs.locale('zh-Hant-HK', dayjsLocale_zhHK)
  dayjs.locale(localeRef.value)
})

// 在全局级别提供筛选功能的状态管理
provide(
  'photosFiltering',
  reactive({
    activeFilters: {
      tags: [],
      cameras: [],
      lenses: [],
      cities: [],
      ratings: [],
    },
  }),
)
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />
    <PhotosProvider
      :photos="photos"
      :refresh="refresh"
      :status="status"
    >
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
      <ClientOnly>
        <PhotoViewer
          :photos="viewerPhotos"
          :current-index="currentPhotoIndex"
          :is-open="isViewerOpen"
          @close="handleClose"
          @index-change="handleIndexChange"
        />
      </ClientOnly>
    </PhotosProvider>
  </UApp>
</template>

<style></style>
