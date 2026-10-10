<script setup lang="ts">
import type { NuxtApp } from 'nuxt/app'
import dayjsLocale_zhCN from 'dayjs/locale/zh-cn'
import dayjsLocale_zhTW from 'dayjs/locale/zh-tw'

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

// ===== 首屏（FOUC）防抖：让 HTML 一进来就是正确主题 =====
// @nuxtjs/color-mode 会在 <head> 注入一段在 Vue water化之前就执行的内联脚本，
// 它默认按 `localStorage.getItem(key) || preference(构建期默认 dark)` 给 <html> 加 class。
// 由于后台主题是通过异步接口加载的，SSR 输出的 <html> 若不带任何主题属性，
// 浏览器首帧会先用默认 dark 渲染，水合后才切浅色——造成"先黑后浅"的闪烁。
// 解法：在 SSR 阶段把有效主题写到 `data-color-mode-forced` 上（设置在我方
// settings 加载完成之后、渲染前写入）。内联脚本逻辑为 `forced && (i = forced)`，
// 因此首帧即采用后台主题，彻底消除闪烁。
const forcedTheme = computed(() => {
  const themeToggleEnabled = !!themeToggleEnabledRef.value
  const systemTheme = (systemThemeRef.value as string) || 'system'
  // 后台把主题设成了明确的 light/dark 才强制；system（跟随系统）交由内联脚本自行判断。
  if (systemTheme !== 'light' && systemTheme !== 'dark') return undefined
  return systemTheme
})
useHead(() => ({
  htmlAttrs: {
    // 仅在「顶栏开关关闭」或 SSR 首帧（后台主题即默认）时强制；
    // 顶栏开关开启时访客可在客户端自行切换，SSR 无访客上下文，仍以后台主题作首帧兜底。
    'data-color-mode-forced':
      import.meta.client && themeToggleEnabledRef.value === true
        ? undefined
        : forcedTheme.value,
  },
}))

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

// ===== 大库渐进加载（数万张照片首页秒开） =====
// 一次性返回全量照片时（含 EXIF 的大 JSON），响应体可达数十 MB：SSR 会整包塞进
// HTML payload、经隧道传输慢、客户端 JSON.parse + 响应式化会长时间阻塞主线程。
// 这里改为「首批 600 张快速出图 + 客户端后台分片补齐」：
// 瀑布流本身是增量挂载（首屏只渲染可见卡片），剩余数据在后台陆续到位即可。
const PHOTO_FIRST_CHUNK = 600
const PHOTO_CHUNK_SIZE = 3000

const pagedUrl = (base: string, limit: number, offset: number) =>
  `${base}${base.includes('?') ? '&' : '?'}limit=${limit}&offset=${offset}`
const firstChunkUrl = computed(() =>
  pagedUrl(apiEndpoint.value, PHOTO_FIRST_CHUNK, 0),
)

// 全局照片池的客户端 TTL 缓存（key 为带 limit 参数的首批 URL）：
// - complete=true → TTL 内直接复用，不发任何请求
// - complete=false → 复用已有数据先渲染，watch 中会触发后台继续补齐
// 仅客户端启用；SSR 每次仍按需拉首批，保证首屏新鲜。
const PHOTO_CACHE_TTL = 60_000
const photoEndpointCache = new Map<
  string,
  { data: Photo[]; at: number; complete: boolean }
>()
let lastServedPayloadKey: string | null = null
const getCachedPhotoData = (
  key: string,
  nuxtApp: NuxtApp,
): Photo[] | undefined => {
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

const { data: firstChunk, refresh: refreshFirstChunk, status } =
  await useFetch<Photo[]>(firstChunkUrl, {
    watch: [firstChunkUrl],
    getCachedData: getCachedPhotoData,
  })

// 完整照片池：首批 + 后台补齐的部分。首批变化（切端点 / refresh / 缓存命中）时重置。
const photos = ref<Photo[]>([...(firstChunk.value ?? [])])

// —— 分片补齐循环 ——
// 幂等：新循环会使旧循环在下一轮检查时自退；服务端排序稳定（拍摄时间 desc, id asc），
// 分片间隙偶有上传导致错位时按 id 去重兜底，不会产生重复卡片。
let hydrationSeq = 0
const markCacheComplete = (key: string, list: Photo[]) => {
  const entry = photoEndpointCache.get(key)
  if (entry) {
    entry.data = list
    entry.at = Date.now()
    entry.complete = true
  } else {
    photoEndpointCache.set(key, { data: list, at: Date.now(), complete: true })
  }
}
const hydrateRemaining = (key: string) => {
  if (!import.meta.client) return
  const seq = ++hydrationSeq
  void (async () => {
    for (;;) {
      if (seq !== hydrationSeq || firstChunkUrl.value !== key) return
      const offset = photos.value.length
      let rows: Photo[]
      try {
        rows = await $fetch<Photo[]>(
          pagedUrl(apiEndpoint.value, PHOTO_CHUNK_SIZE, offset),
        )
      } catch {
        // 网络抖动：下次 TTL 到期或 refresh 时会重新补齐
        return
      }
      if (seq !== hydrationSeq || firstChunkUrl.value !== key) return
      if (!rows || rows.length === 0) {
        markCacheComplete(key, photos.value)
        return
      }
      const existing = new Set(photos.value.map((p) => p.id))
      const fresh = rows.filter((r) => !existing.has(r.id))
      if (fresh.length > 0) photos.value = [...photos.value, ...fresh]
      if (rows.length < PHOTO_CHUNK_SIZE) {
        markCacheComplete(key, photos.value)
        return
      }
    }
  })()
}

// 首批数据变化 → 重置照片池，并后台补齐剩余部分
watch(
  firstChunk,
  (val) => {
    if (!val) return
    const key = firstChunkUrl.value
    photos.value = [...val]
    if (!import.meta.client) return
    // SSR payload 复用路径：只带了首批（600 张），客户端仍需后台补齐其余部分
    if (lastServedPayloadKey === key) {
      lastServedPayloadKey = null
      hydrateRemaining(key)
      return
    }
    // 走网络拉取的首批（或缓存命中）：写缓存占位。
    // complete 判定：库不足一批（已全量）或命中缓存里本就完整的同一份数据。
    const cached = photoEndpointCache.get(key)
    const complete =
      val.length < PHOTO_FIRST_CHUNK || (cached?.data === val && cached.complete)
    photoEndpointCache.set(key, {
      data: photos.value,
      at: Date.now(),
      complete,
    })
    if (!complete) hydrateRemaining(key)
  },
  { immediate: true },
)

// 对外暴露的 refresh：重拉首批；watch 会随之重置照片池并重新后台补齐，
// 上传 / 删除后的画廊更新语义与旧版（全量刷新）保持一致。
const refresh = async () => {
  await refreshFirstChunk()
}

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
