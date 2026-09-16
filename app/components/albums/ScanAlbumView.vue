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
  node: { title: string; relPath: string }
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
const showPassword = ref(false)
const unlockError = ref<string | null>(null)
const unlockSuccess = ref(false)
const unlocking = ref(false)
// 每次解锁失败自增，作为 error-key 触发卡片抖动动画
const shakeKey = ref(0)
const onSubmitPassword = async () => {
  unlockError.value = null
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
    passwordInput.value = ''
    unlockSuccess.value = true
    // 短暂展示“密码正确”的成功反馈，再切换到相簿内容
    await new Promise((r) => setTimeout(r, 700))
    await refresh()
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number })?.statusCode
    unlockError.value =
      statusCode === 401
        ? t('albums.scan.wrongPassword')
        : t('albums.scan.unlockError')
    shakeKey.value++ // 触发抖动
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
        class="mb-8 flex items-center gap-3 text-3xl font-black text-neutral-900 dark:text-neutral-100"
      >
        {{ data?.node?.title }}
        <span v-if="data?.passwordProtected" class="inline-flex items-center gap-1 text-sm font-normal">
          <Icon name="tabler:lock" class="size-5 text-neutral-400" />
        </span>
      </h1>
    </div>

    <div v-if="status === 'pending'" class="py-24 text-center text-neutral-400">
      {{ t('albums.scan.loading') }}
    </div>

    <div v-if="status !== 'pending' && !data" class="py-24 text-center text-neutral-400">
      {{ t('albums.scan.notFound') }}
    </div>

    <div
      v-if="data?.passwordProtected && !data?.authorized"
      class="mx-auto w-full max-w-md px-6"
    >
      <div class="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl shadow-neutral-200/40 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/20">
        <!-- 顶部纤细的锁形装饰条 -->
        <div class="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />

        <div
          :key="shakeKey"
          :class="unlockSuccess ? 'kernel-lock-fade' : unlockError ? 'kernel-lock-shake' : ''"
          class="relative flex flex-col items-center gap-3 text-center"
        >
          <!-- 图标：成功时绿色对勾，否则锁定图标 -->
          <div
            :class="unlockSuccess
              ? 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/30'
              : 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700'"
            class="relative rounded-2xl p-4 transition-colors duration-300"
          >
            <Icon :name="unlockSuccess ? 'tabler:lock-open-2' : 'tabler:lock'" class="size-8" />
          </div>

          <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {{ t('albums.scan.lockedTitle') }}
          </h2>
          <p class="max-w-[26ch] text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('albums.scan.lockedHint') }}
          </p>
        </div>

        <!-- 密码输入区 -->
        <form v-if="!unlockSuccess" class="relative mt-6 space-y-4" @submit.prevent="onSubmitPassword">
          <UInput
            v-model="passwordInput"
            :type="showPassword ? 'text' : 'password'"
            :placeholder="t('albums.scan.passwordPlaceholder')"
            size="lg"
            autocomplete="current-password"
            :disabled="unlocking"
          >
            <template #leading>
              <Icon name="tabler:key" class="text-neutral-400 dark:text-neutral-500" />
            </template>
            <template #trailing>
              <button
                type="button"
                class="text-neutral-400 transition-colors hover:text-neutral-600 dark:hover:text-neutral-200"
                :aria-label="showPassword ? 'hide' : 'show'"
                @click="showPassword = !showPassword"
              >
                <Icon :name="showPassword ? 'tabler:eye-off' : 'tabler:eye'" class="size-5" />
              </button>
            </template>
          </UInput>

          <Transition name="kernel-msg" mode="out-in">
            <p
              v-if="unlockError"
              :key="'err'"
              class="flex items-center justify-center gap-1.5 text-sm font-medium text-red-500"
            >
              <Icon name="tabler:alert-circle" class="size-4 shrink-0" />
              {{ unlockError }}
            </p>
          </Transition>

          <UButton
            type="submit"
            size="lg"
            class="w-full justify-center"
            icon="tabler:lock-open"
            :loading="unlocking"
          >
            {{ unlocking ? t('albums.scan.unlocking') : t('albums.scan.unlock') }}
          </UButton>
        </form>

        <!-- 解锁成功反馈 -->
        <Transition v-else name="kernel-msg" appear>
          <div class="relative mt-6 flex flex-col items-center gap-2 text-center">
            <Icon name="tabler:check" class="size-7 text-emerald-500" />
            <p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">
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

      <!-- 照片瀑布流 -->
      <div v-if="data!.dirPhotos.length">
        <h2 class="mb-4 px-6 text-base font-semibold text-neutral-700 dark:text-neutral-300">
          {{ t('albums.scan.photos') }}
        </h2>
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
/* 解锁失败：密码卡抖动提示 */
@keyframes kernel-lock-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-5px); }
  80% { transform: translateX(5px); }
}
.kernel-lock-shake {
  animation: kernel-lock-shake 0.4s ease-in-out;
}

/* 解锁成功：图标/文字淡入 */
@keyframes kernel-lock-fade {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.kernel-lock-fade {
  animation: kernel-lock-fade 0.35s ease-out;
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