<script setup lang="ts">
import type { NuxtApp } from 'nuxt/app'
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

// 主题优先级（与后台外观设置联动，避免两套主题控制互相冲突）：
// - 「顶栏显示主题切换按钮」(app:appearance.themeToggle) 开启：访客通过顶栏切换保存的
//   手动选择（localStorage cframe-color-mode）优先于「应用主题」；「应用主题」仅作默认兜底。
// - 该开关关闭（默认）：一律按「应用主题」(app:appearance.theme) 应用，忽略历史手动选择，
//   从而保证后台把主题设为浅色时，画廊顶栏等界面能真正切到浅色（不会因以前手动切过深色
//   而被 localStorage 覆盖成深色）。
// 用响应式 ref 承接后台设置，便于下方 watch 在这些设置为空/首次载入后才同步时仍能生效
const themeToggleEnabledRef = useSettingRef('app:appearance.themeToggle')
const systemThemeRef = useSettingRef('app:appearance.theme')

// 根据优先级结算实际生效主题并写入 colorMode.preference，同时联动 colorMode.force：
// - 「顶栏显示主题切换按钮」关闭（默认）：强制所有访客都采用「应用主题」。
//   force=true 让 Nuxt colorMode 完全忽略浏览器 localStorage 里的历史手动选择，
//   真正做到"后台设为浅色 → 所有访问者都是浅色"。
// - 该开关开启：force=true 时不可行，改用尊重访客手动选择。
// 用 watch(..., { immediate:true }) 而非一次性代码：
// - 后台保存主题后 SPA 内切换到画廊时能实时跟随，无需整页刷新；
// - SSR 阶段也结算一次（下面按 import.meta.client 分派），让刷新/首屏直接渲染正确主题，
//   避免顶栏先按默认 dark 渲染造成"灰色透明一闪才变浅色"。
function applyThemePrecedence() {
  const themeToggleEnabled = !!themeToggleEnabledRef.value
  const systemTheme = (systemThemeRef.value as string) || 'system'
  if (!import.meta.client) {
    // SSR：无 localStorage 可读。开关关闭（默认）时强制按「应用主题」输出 html 主题类，
    // 刷新/直连画廊首屏即为正确主题，顶栏不会闪灰。
    colorMode.force = !themeToggleEnabled
    colorMode.preference = systemTheme
    return
  }
  if (!themeToggleEnabled) {
    // 开关关闭：强制所有访客采用后台「应用主题」，忽略任何历史手动选择。
    colorMode.force = true
    colorMode.preference = systemTheme
    return
  }
  // 开关开启：尊重访客手动选择（Nuxt 默认读取 localStorage），「应用主题」仅作兜底。
  colorMode.force = false
  let storedTheme: string | null = null
  try {
    storedTheme = window.localStorage.getItem('cframe-color-mode')
  } catch {
    storedTheme = null
  }
  colorMode.preference =
    storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : systemTheme
}
watch([themeToggleEnabledRef, systemThemeRef], applyThemePrecedence, {
  immediate: true,
})

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
// 全局照片池的客户端 TTL 缓存：
// 后台管理 / 画廊切换时 apiEndpoint 会变，`/api/photos`（或 /visible）首次进入要全量拉取含完整 EXIF 的大 JSON，
// 这是"每次进入 dashboard/photos 都很慢"的主要来源之一。这里在客户端按端点缓存一份，TTL 内导航复用，避免重复请求。
// 语义：
// - 命中未过期缓存 → 直接返回（不触发网络），watch 见同一引用 → 不续期，TTL 稳定。
// - 无缓存首访 → 回落到 SSR payload（默认行为），避免水合时重复请求；该次不写缓存。
// - 缓存过期 → 返回 undefined 强制走一次网络刷新，并把新数据写回。
// 仅客户端启用；SSR 每次仍按需拉取，保证首屏新鲜。上传 / 编辑等操作后已有 refresh() 会强制刷新并写回缓存。
const PHOTO_CACHE_TTL = 60_000
const photoEndpointCache = new Map<string, { data: Photo[]; at: number }>()
let lastServedPayloadKey: string | null = null
const getCachedPhotoData = (key: string, nuxtApp: NuxtApp): Photo[] | undefined => {
  if (!import.meta.client) return undefined
  const hit = photoEndpointCache.get(key)
  if (hit) {
    if (Date.now() - hit.at < PHOTO_CACHE_TTL) return hit.data
    photoEndpointCache.delete(key)
    // 缓存过期 → 强制刷新
    return undefined
  }
  // 未命中（首访）：回落到 SSR payload，避免水合重复拉取
  lastServedPayloadKey = key
  return nuxtApp.payload.data?.[key] as Photo[] | undefined
}

const { data, refresh, status } = await useFetch<Photo[]>(() => apiEndpoint.value, {
  watch: [apiEndpoint],
  getCachedData: getCachedPhotoData,
})
// 仅把"真正来自网络"的新数据写回缓存：
// - 命中缓存（同引用）→ 跳过、不续期；
// - 回落 payload 首次渲染 → 跳过（lastServedPayloadKey 标记），保证 TTL 语义。
watch(data, (val) => {
  if (!import.meta.client || !val) return
  const key = apiEndpoint.value
  if (lastServedPayloadKey === key) {
    lastServedPayloadKey = null
    return
  }
  const existing = photoEndpointCache.get(key)
  if (existing && existing.data === val) return
  photoEndpointCache.set(key, { data: val, at: Date.now() })
})

const photos = computed(() => (data.value as Photo[]) || [])

// ===== 后台上传 → 画廊无刷新实时更新 =====
// 后台（可能在同一浏览器的另一个标签页）上传/删除照片时，当前已打开的画廊不会自动知道。
// 这里在客户端做轻量轮询：只请求不含 EXIF 的"指纹"(可见数量+最新拍摄时间)，
// 只有当指纹变化时才触发一次完整 refresh()，既实现"无需刷新浏览器就出现新照片"，
// 又不高频拉取全量 EXIF 大 JSON。后台 /dashboard 自带刷新机制，这里跳过避免重复。
const FEED_POLL_MS = 8000
if (import.meta.client) {
  let lastFeedSignature = ''
  let feeding = false
  let feedTimer: ReturnType<typeof setInterval> | null = null

  const pollFeed = async () => {
    if (feeding) return
    if (route.path.startsWith('/dashboard')) return
    if (typeof document !== 'undefined' && document.hidden) return
    feeding = true
    try {
      const sig = await $fetch<{ count: number; maxDateTaken: string | null }>(
        '/api/photos/feed-status',
      ).then((r) => `${r.count}|${r.maxDateTaken || 'null'}`)
      if (lastFeedSignature === '') {
        // 首轮仅建立基线，不触发刷新（首屏数据在 SSR/首次拉取时已就绪）
        lastFeedSignature = sig
        return
      }
      if (sig !== lastFeedSignature) {
        lastFeedSignature = sig
        await refresh()
      }
    } catch {
      // 网络抖动或尚未就绪，忽略，下一轮再试
    } finally {
      feeding = false
    }
  }

  onMounted(() => {
    feedTimer = setInterval(pollFeed, FEED_POLL_MS)
    document.addEventListener('visibilitychange', pollFeed)
  })
  onUnmounted(() => {
    if (feedTimer) clearInterval(feedTimer)
    document.removeEventListener('visibilitychange', pollFeed)
  })
}

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
        <PhotoPanoramaOverlay />
      </ClientOnly>
    </PhotosProvider>
  </UApp>
</template>

<style></style>
