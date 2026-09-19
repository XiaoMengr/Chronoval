<script lang="ts" setup>
import type { ScanPhoto } from '~/components/albums/scanPhoto'

interface ScanChildNode {
  kind: 'scan'
  libId: number
  relPath: string
  title: string
  link: string
  photoCount: number
  coverPhotoId: string | null
  covers: ScanPhoto[]
  passwordProtected: boolean
  hasChildren: boolean
}
interface ScanAlbumPayload {
  node: {
    title: string
    relPath: string
    photoCount?: number
    description?: string | null
    createdAt?: string | null
  }
  dirPhotos: ScanPhoto[]
  children: ScanChildNode[]
  passwordProtected: boolean
  authorized: boolean
}

const props = withDefaults(
  defineProps<{
    /** 公开 URL 标识（base36 时间戳或存量数字 id） */
    libKey: string
    relPath?: string
    /** scan=通过数字 id 路由；slug=通过自定义别名路由（不渲染层级面包屑） */
    mode?: 'scan' | 'slug'
  }>(),
  {
    relPath: '',
    mode: 'scan',
  },
)

const relPath = computed(() => props.relPath || '')
const { t } = useI18n()
const dayjs = useDayjs()

const { data, status, refresh } = await useAsyncData<ScanAlbumPayload>(
  () => `scan-album-${props.libKey}-${relPath.value}`,
  () =>
    $fetch<ScanAlbumPayload>(
      `/api/albums/scan/${props.libKey}`,
      {
        query: { path: relPath.value },
      },
    ),
  { watch: [() => props.libKey, relPath] },
)

const passwordInput = ref('')
const unlockError = ref<string | null>(null)
const unlockSuccess = ref(false)
const unlocking = ref(false)
// 每次解锁失败自增，作为 error-key 触发卡片抖动动画
const shakeKey = ref(0)
// 瞬时“解锁失败”态：驱动锁+钥匙动画，稍后自动还原回待输入界面
const unlockFailed = ref(false)
let failTimer: ReturnType<typeof setTimeout> | null = null

const stopFailTimer = () => {
  if (failTimer) {
    clearTimeout(failTimer)
    failTimer = null
  }
}

const onSubmitPassword = async () => {
  if (unlocking.value) return // 防止并发/重复提交
  unlockError.value = null
  unlockFailed.value = false
  stopFailTimer()
  const pw = passwordInput.value
  if (!pw) {
    unlockError.value = t('albums.scan.passwordRequired')
    shakeKey.value++
    return
  }
  unlocking.value = true
  try {
    await $fetch(`/api/albums/scan/${props.libKey}`, {
      method: 'POST',
      query: { path: relPath.value },
      body: { password: pw },
    })
    stopFailTimer()
    unlockFailed.value = false
    passwordInput.value = ''
    unlockSuccess.value = true
    // 短暂展示“密码正确”的成功反馈，再切换到相簿内容
    await new Promise((r) => setTimeout(r, 700))
    await refresh()
  } catch (e: unknown) {
    // 无论错误码，都必须给出明确的失败反馈
    const statusCode = (e as { statusCode?: number })?.statusCode
    unlockFailed.value = true
    unlockError.value =
      statusCode === 401
        ? t('albums.scan.wrongPassword')
        : t('albums.scan.unlockError')
    shakeKey.value++ // 触发卡片抖动
    // 钥匙/红叉/抖动动画稍后自动还原；错误文案保留到下一次提交，确保有反馈
    stopFailTimer()
    failTimer = setTimeout(() => {
      unlockFailed.value = false
      failTimer = null
    }, 1200)
  } finally {
    unlocking.value = false
  }
}

const crumbs = computed(() => {
  const rel = data.value?.node?.relPath || ''
  if (props.mode === 'slug') {
    // 自定义别名模式下只展示单层（无层级路径）
    return []
  }
  return rel.split('/').filter(Boolean)
})

/** 本相簿直接照片数（与普通相簿头部一致） */
const photoCount = computed(() => {
  const n = data.value?.node?.photoCount
  if (typeof n === 'number') return n
  return data.value?.dirPhotos.length ?? 0
})

/** 根据目录照片拍摄时间推导日期范围文本（格式与普通相簿一致） */
const dateRangeText = computed(() => {
  const dates = (data.value?.dirPhotos ?? [])
    .map((p) => p.dateTaken)
    .filter((d): d is string => Boolean(d))
    .sort()
  if (dates.length === 0) return null
  const start = dayjs(dates[0])
  const end = dayjs(dates[dates.length - 1])
  if (start.isSame(end, 'day')) return start.format('ll')
  if (start.isSame(end, 'month')) return start.format('MMM YYYY')
  if (start.isSame(end, 'year')) return `${start.format('MMM')} - ${end.format('MMM YYYY')}`
  return `${start.format('ll')} - ${end.format('ll')}`
})

const createdAt = computed(() => data.value?.node?.createdAt ?? null)

// 轻量查看器状态
const viewer = ref<{ open: boolean; index: number }>({ open: false, index: 0 })
const openPhoto = (index: number) => {
  viewer.value = { open: true, index }
}
const closeViewer = () => {
  viewer.value = { open: false, index: 0 }
}
const onViewerIndexChange = (index: number) => {
  viewer.value.index = index
}
</script>

<template>
  <!-- 全宽展示容器：与首页画廊一致（edge-to-edge） -->
  <div class="min-h-svh w-full bg-white pb-16 dark:bg-neutral-950">
    <!-- 顶部导航 / 标题区 -->
    <div class="px-6 pt-6">
      <div class="mb-6 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
        <NuxtLink to="/albums" class="flex items-center gap-1 transition-colors hover:text-neutral-800 dark:hover:text-neutral-100">
          <Icon name="tabler:arrow-left" class="size-4" />
          <span>{{ t('title.albums') }}</span>
        </NuxtLink>
        <template v-if="crumbs.length">
          <span>/</span>
          <NuxtLink
            v-for="(seg, i) in crumbs"
            :key="seg"
            :to="`/albums/scan/${libKey}/${crumbs.slice(0, i + 1).join('/')}`"
            class="max-w-[16ch] truncate transition-colors hover:text-neutral-800 dark:hover:text-neutral-100"
          >
            {{ seg }}
          </NuxtLink>
        </template>
      </div>

      <h1
        class="mb-2 flex items-center gap-3 text-3xl font-black text-neutral-900 dark:text-neutral-100"
      >
        {{ data?.node?.title }}
        <span v-if="data?.passwordProtected" class="inline-flex items-center gap-1 text-sm font-normal">
          <Icon name="tabler:lock" class="size-5 text-neutral-400" />
        </span>
      </h1>

      <!-- 元信息：照片数 / 日期范围 / 创建时间（与普通相簿头部一致）；仅在未设锁或已解锁时展示 -->
      <div
        v-if="!data?.passwordProtected || data?.authorized"
        class="mb-8 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm"
      >
        <div class="flex items-center gap-1">
          <Icon
            name="tabler:photo"
            class="size-4 -mt-0.5 text-neutral-400 dark:text-neutral-500"
          />
          <span class="text-neutral-700 dark:text-neutral-200">
            <span class="font-medium text-neutral-900 dark:text-white">
              {{ photoCount }}
            </span>
            <span class="text-neutral-500 dark:text-neutral-400 ml-1">
              {{ t('album.metadata.photos') }}
            </span>
          </span>
        </div>

        <div v-if="dateRangeText" class="flex items-center gap-1">
          <Icon
            name="tabler:calendar"
            class="size-4 -mt-0.5 text-neutral-400 dark:text-neutral-500"
          />
          <span class="text-neutral-700 dark:text-neutral-200">
            {{ dateRangeText }}
          </span>
        </div>

        <div v-if="createdAt" class="flex items-center gap-1">
          <Icon
            name="tabler:clock-plus"
            class="size-4 -mt-0.5 text-neutral-400 dark:text-neutral-500"
          />
          <span class="text-neutral-700 dark:text-neutral-200">
            {{ t('album.metadata.created') }}
            <ClientOnly fallback="…">{{ dayjs(createdAt).fromNow() }}</ClientOnly>
          </span>
        </div>
      </div>
    </div>

    <div v-if="status === 'pending'" class="py-24 text-center text-neutral-400">
      {{ t('albums.scan.loading') }}
    </div>

    <div v-if="status !== 'pending' && !data" class="py-24 text-center text-neutral-400">
      {{ t('albums.scan.notFound') }}
    </div>

    <div
      v-if="data?.passwordProtected && !data?.authorized"
      class="relative flex min-h-[60vh] items-center justify-center overflow-hidden px-5 py-16 sm:px-6"
    >
      <!-- 柔和环境光晕：向四周渐隐到透明，给玻璃卡片提供可模糊的层次，也不产生硬色块 -->
      <div
        class="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_60%_at_50%_42%,#e3e5ec_0%,rgba(227,229,236,0)_74%)] dark:bg-[radial-gradient(55%_60%_at_50%_42%,#26262c_0%,rgba(38,38,44,0)_74%)]"
      />

      <div
        :key="shakeKey"
        :class="unlockError ? 'kernel-lock-shake' : ''"
        class="kernel-lock-card relative mx-auto w-full max-w-[25rem]"
      >
        <!-- 顶部发丝高光线 -->
        <div class="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/15" />

        <!-- 锁形徽记 + 标题 -->
        <div class="relative flex flex-col items-center gap-4 px-8 pb-2 pt-9 text-center sm:px-9">
          <div
            class="relative grid size-16 place-items-center"
          >
            <svg
              viewBox="0 0 48 48"
              fill="none"
              :class="unlockSuccess ? 'kd-open' : unlockFailed ? 'kd-error' : unlocking ? 'kd-try' : ''"
              class="kernel-lock-svg relative size-11"
            >
              <defs>
                <linearGradient id="kd-lock-body" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="var(--kd-body-hi)" />
                  <stop offset="0.55" stop-color="var(--kd-body-mid)" />
                  <stop offset="1" stop-color="var(--kd-body-lo)" />
                </linearGradient>
                <linearGradient id="kd-lock-shackle" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="var(--kd-shackle-hi)" />
                  <stop offset="1" stop-color="var(--kd-shackle-lo)" />
                </linearGradient>
                <linearGradient id="kd-lock-shade" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stop-color="rgba(0,0,0,0)" />
                  <stop offset="1" stop-color="rgba(0,0,0,0.16)" />
                </linearGradient>
              </defs>

              <!-- 落地投影 -->
              <ellipse cx="24" cy="41.5" rx="16.5" ry="2.4" fill="rgba(0,0,0,0.16)" />

              <!-- 金属拱形锁梁（解锁时弹开） -->
              <g class="kernel-lock-shackle">
                <path
                  d="M17.5 21.5 V15.4 a6.6 6.6 0 0 1 13.2 0 V21.5"
                  stroke="url(#kd-lock-shackle)"
                  stroke-width="4.8"
                  stroke-linecap="round"
                />
                <path
                  d="M18.6 21.5 V16 a5.4 5.4 0 0 1 10.8 0 V21.5"
                  stroke="rgba(255,255,255,0.5)"
                  stroke-width="1"
                  stroke-linecap="round"
                />
              </g>

              <!-- 锁体 -->
              <rect x="10.5" y="19.5" width="27" height="20" rx="5.5" fill="url(#kd-lock-body)" />
              <rect x="13" y="21.3" width="22" height="2" rx="1" fill="rgba(255,255,255,0.6)" />
              <rect x="11.5" y="36" width="25" height="2.6" rx="1.3" fill="url(#kd-lock-shade)" />
              <path
                d="M12.3 24 Q11 25.6 11 28.2 v3 Q11 34 13 36.8 l1-1.3 Q13 34 13 31.2 v-3 Q13 25.6 14 23.6 Z"
                fill="rgba(0,0,0,0.06)"
              />

              <!-- 锁孔 -->
              <g class="kernel-lock-keyhole">
                <rect x="22.7" y="34.6" width="2.6" height="4.4" rx="1.2" fill="var(--kd-keyhole)" />
                <circle cx="24" cy="30.6" r="3" fill="var(--kd-keyhole)" />
                <circle cx="23.2" cy="29.8" r="0.9" fill="rgba(255,255,255,0.5)" />
              </g>

              <!-- 插入的钥匙（解锁失败时出现并扭动） -->
              <g class="kernel-lock-key">
                <circle cx="24" cy="24" r="3" fill="none" stroke="var(--kd-key-line)" stroke-width="1.7" />
                <path d="M24 27 v8.6" stroke="var(--kd-key-line)" stroke-width="1.9" stroke-linecap="round" />
                <path d="M26 33.2 h1.5 M25.7 36 h2.3" stroke="var(--kd-key-line)" stroke-width="1.4" stroke-linecap="round" />
              </g>

              <!-- 解锁成功：锁孔旁浮现绿色对勾 -->
              <g class="kernel-lock-check">
                <circle cx="30" cy="27.5" r="7" fill="rgba(16,185,129,0.12)" stroke="rgba(16,185,129,0)" />
                <path
                  d="M26.8 27.6 l2.2 2.3 4.1-4.4"
                  stroke="#10b981"
                  stroke-width="2.2"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </g>

              <!-- 解锁失败：钥匙拧不动时弹红色叉号 -->
              <g class="kernel-lock-x">
                <circle cx="30" cy="27.5" r="7" fill="rgba(239,68,68,0.12)" />
                <path
                  d="M27.7 25.2 l4.6 4.6 M32.3 25.2 l-4.6 4.6"
                  stroke="#ef4444"
                  stroke-width="2.2"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </g>
            </svg>
          </div>
          <h2 class="text-[17px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            {{ t('albums.scan.lockedTitle') }}
          </h2>
          <p class="text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {{ t('albums.scan.lockedHint') }}
          </p>
        </div>

        <!-- 密码输入区 -->
        <form
          v-if="!unlockSuccess"
          class="relative flex flex-col items-stretch gap-3.5 px-8 pb-9 pt-5 sm:px-9"
          @submit.prevent="onSubmitPassword"
        >
          <!-- 极简密码框：无边框灰色线条，仅半透明磨砂填充 -->
          <div class="relative">
            <span class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-neutral-400 dark:text-neutral-500">
              <Icon name="tabler:key" class="size-4" />
            </span>
            <input
              v-model="passwordInput"
              type="password"
              :placeholder="t('albums.scan.passwordPlaceholder')"
              autocomplete="current-password"
              :disabled="unlocking"
              class="size-full w-full rounded-2xl bg-black/[0.035] px-6 py-3 text-center text-sm text-neutral-900 outline-none transition-colors placeholder:text-center placeholder:text-neutral-400 selection:bg-black/10 hover:bg-black/[0.05] focus:bg-black/[0.05] dark:bg-white/[0.05] dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:hover:bg-white/[0.07] dark:focus:bg-white/[0.07]"
            />
          </div>

          <Transition name="kernel-msg" mode="out-in">
            <p
              v-if="unlockError"
              :key="'err'"
              class="flex items-center justify-center gap-1.5 text-center text-[13px] font-medium text-red-500"
            >
              <Icon name="tabler:alert-circle" class="size-4 shrink-0" />
              {{ unlockError }}
            </p>
          </Transition>

          <button
            type="submit"
            :disabled="unlocking"
            class="group relative mt-0.5 flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-300/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200 dark:focus-visible:ring-black/20 dark:focus-visible:ring-offset-neutral-950"
          >
            <Icon v-if="unlocking" name="tabler:loader-2" class="size-4 animate-spin" />
            <Icon v-else name="tabler:lock-open" class="size-4" />
            {{ unlocking ? t('albums.scan.unlocking') : t('albums.scan.unlock') }}
          </button>
        </form>

        <!-- 解锁成功反馈 -->
        <Transition v-else name="kernel-msg" appear>
          <div class="relative flex flex-col items-center gap-3 px-8 pb-10 pt-4 text-center">
            <span class="grid size-12 place-items-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <Icon name="tabler:check" class="size-6 text-emerald-500" />
            </span>
            <p class="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              {{ t('albums.scan.passwordCorrect') }}
            </p>
          </div>
        </Transition>
      </div>
    </div>

    <template
      v-if="status !== 'pending' && !!data && (!data.passwordProtected || data.authorized)"
    >
      <!-- 嵌套子相簿 -->
      <div v-if="data!.children.length" class="mb-10 px-6">
        <h2 class="mb-4 text-base font-semibold text-neutral-700 dark:text-neutral-300">
          {{ t('albums.scan.subAlbums') }}
        </h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          <NuxtLink
            v-for="child in data!.children"
            :key="child.link"
            :to="child.link"
            class="group block overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div class="relative aspect-[3/4] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
              <ClientOnly>
                <ThumbImage
                  v-if="child.covers[0]"
                  class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  :src="child.covers[0].thumbnailUrl || ''"
                  :fallback-src="child.covers[0].originalUrl || ''"
                  :thumbhash="child.covers[0].thumbnailHash"
                  :alt="child.title"
                  :style="{ aspectRatio: child.covers[0].aspectRatio || 3 / 4 }"
                />
                <div
                  v-if="!child.covers[0]"
                  class="flex h-full items-center justify-center text-neutral-300"
                >
                  <Icon name="tabler:folder" class="size-8" />
                </div>
              </ClientOnly>
              <Icon
                v-if="child.passwordProtected"
                name="tabler:lock"
                class="absolute right-2 top-2 size-4 text-white drop-shadow"
              />
            </div>
            <div class="p-3">
              <p class="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                {{ child.title }}
              </p>
              <p class="text-xs text-neutral-400">
                {{ child.photoCount }} {{ t('albums.scan.photos') }}
              </p>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- 照片瀑布流（头部已展示照片数，此处不再显示冗余标题） -->
      <div v-if="data!.dirPhotos.length">
        <ClientOnly>
          <AlbumsScanMasonry :photos="data!.dirPhotos" @open="openPhoto" />
        </ClientOnly>
      </div>
      <p v-else-if="!data!.children.length" class="py-16 text-center text-neutral-400">
        {{ t('albums.scan.empty') }}
      </p>
    </template>

    <!-- 查看器 -->
    <ClientOnly>
      <AlbumsScanPhotoViewer
        v-if="data?.dirPhotos"
        :photos="data.dirPhotos"
        :current-index="viewer.index"
        :is-open="viewer.open"
        @close="closeViewer"
        @index-change="onViewerIndexChange"
      />
    </ClientOnly>
  </div>
</template>

<style scoped>
/* 锁定卡片：磨砂玻璃 + 细微暖白渐变，比照片白底略深一档，清晰区隔 */
.kernel-lock-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgb(0 0 0 / 0.06);
  border-radius: 1.75rem;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.94), rgb(246 246 248 / 0.9));
  backdrop-filter: saturate(160%) blur(26px);
  -webkit-backdrop-filter: saturate(160%) blur(26px);
  box-shadow:
    inset 0 0.5px 0 rgb(255 255 255 / 0.85),
    0 1px 2px rgb(0 0 0 / 0.04),
    0 22px 50px -26px rgb(0 0 0 / 0.2);
  animation: kernel-lock-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.dark .kernel-lock-card {
  border-color: rgb(255 255 255 / 0.12);
  background: linear-gradient(180deg, rgb(28 28 32 / 0.72), rgb(14 14 16 / 0.72));
  box-shadow:
    inset 0 0.5px 0 rgb(255 255 255 / 0.06),
    0 22px 55px -28px rgb(0 0 0 / 0.75);
}

/* 卡片入场：轻微上浮 + 淡入 */
@keyframes kernel-lock-rise {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* 解锁失败：卡片水平抖动提示 */
@keyframes kernel-lock-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-9px); }
  40% { transform: translateX(9px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}
.kernel-lock-shake {
  animation: kernel-lock-shake 0.42s ease-in-out;
}

/* 拟物金属挂锁：颜色经 CSS 变量随亮/暗自动切换 */
.kernel-lock-svg {
  --kd-body-hi: #eef1f4;
  --kd-body-mid: #c6ccd3;
  --kd-body-lo: #a6adb6;
  --kd-shackle-hi: #f7f8fa;
  --kd-shackle-lo: #adb4bd;
  --kd-keyhole: #3c434b;
  --kd-key-line: #7b838c;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.18));
}
.dark .kernel-lock-svg {
  --kd-body-hi: #3a3f47;
  --kd-body-mid: #262b32;
  --kd-body-lo: #16191d;
  --kd-shackle-hi: #6a737d;
  --kd-shackle-lo: #33383f;
  --kd-keyhole: #0c0e10;
  --kd-key-line: #c6ccd3;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}

/* ===== 钥匙开锁动画（三态） =====
   idle     待输入，钥匙隐藏
   kd-try   提交中：钥匙滑入锁孔并转动
   kd-open  成功：锁梁弹开 + 绿色对勾，钥匙拔出
   kd-error 失败：钥匙被卡住来回拧 + 红色叉号 */

/* 钥匙默认隐藏在锁体右侧 */
.kernel-lock-key {
  opacity: 0;
  transform: translateX(20px);
  transform-origin: 24px 31px;
  transform-box: view-box;
}

/* 提交中：钥匙滑入锁孔并转动到解锁位 */
.kd-try .kernel-lock-key {
  animation: kd-key-insert 0.75s ease forwards;
}
@keyframes kd-key-insert {
  0% { transform: translateX(20px) rotate(0deg); opacity: 0; }
  32% { transform: translateX(0) rotate(0deg); opacity: 1; }
  58% { transform: translateX(0) rotate(20deg); opacity: 1; }
  100% { transform: translateX(0) rotate(20deg); opacity: 1; }
}

/* 成功：钥匙反拧拔出并淡出 */
.kd-open .kernel-lock-key {
  animation: kd-key-out 0.35s ease 0.45s forwards;
}
@keyframes kd-key-out {
  to { transform: translateX(0) rotate(-14deg); opacity: 0; }
}

/* 失败：钥匙被卡住来回拧 */
.kd-error .kernel-lock-key {
  animation: kd-key-jam 0.5s ease forwards;
}
@keyframes kd-key-jam {
  0% { transform: translateX(0) rotate(20deg); opacity: 1; }
  25% { transform: translateX(0) rotate(46deg); opacity: 1; }
  50% { transform: translateX(0) rotate(2deg); opacity: 1; }
  72% { transform: translateX(0) rotate(-12deg); opacity: 1; }
  100% { transform: translateX(0) rotate(20deg); opacity: 1; }
}

/* 锁梁弹开：仅在锁被真正打开时 */
.kernel-lock-shackle {
  transform-origin: 50% 34%;
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.15s;
}
.kd-open .kernel-lock-shackle {
  transform: rotate(14deg) translateY(-3px);
}

/* 成功对勾浮现 + 勾线描画 */
.kernel-lock-check {
  opacity: 0;
  transform: scale(0.5);
  transform-origin: 50% 50%;
  transition: opacity 0.3s ease 0.3s, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1) 0.3s;
}
.kernel-lock-check path {
  stroke-dasharray: 20;
  stroke-dashoffset: 20;
}
.kd-open .kernel-lock-check {
  opacity: 1;
  transform: scale(1);
}
.kd-open .kernel-lock-check path {
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 0.35s ease 0.55s;
}

/* 失败：锁身扭动 */
@keyframes kernel-lock-jiggle {
  0%, 100% { transform: rotate(0deg); }
  14% { transform: rotate(-6deg) translateX(-2px); }
  30% { transform: rotate(5deg) translateX(2px); }
  46% { transform: rotate(-4deg); }
  60% { transform: rotate(3deg); }
  74% { transform: rotate(-2deg); }
  88% { transform: rotate(1deg); }
}
.kd-error {
  animation: kernel-lock-jiggle 0.55s cubic-bezier(0.34, 1.4, 0.64, 1);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)) drop-shadow(0 0 5px rgba(239, 68, 68, 0.3));
}

/* 错误叉号 */
.kernel-lock-x {
  opacity: 0;
  transform: scale(0.4) rotate(-14deg);
  transform-origin: 50% 50%;
  transition: opacity 0.22s ease 0.25s, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1) 0.25s;
}
.kd-error .kernel-lock-x {
  opacity: 1;
  transform: scale(1) rotate(0deg);
}

/* 错误提示消息出入场 */
.kernel-msg-enter-active,
.kernel-msg-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.kernel-msg-enter-from,
.kernel-msg-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>