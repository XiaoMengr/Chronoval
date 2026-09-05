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

const route = useRoute()
const slug = computed(() => ((route.params.slug || []) as string[]) || [])
const libId = computed(() => Number(slug.value[0]))
const relPath = computed(() =>
  slug.value
    .slice(1)
    .map((s: string) => decodeURIComponent(s))
    .join('/'),
)

const { data, status, refresh } = await useAsyncData<ScanAlbumPayload>(
  () => `scan-album-${libId.value}-${relPath.value}`,
  () =>
    $fetch<ScanAlbumPayload>(`/api/albums/scan/${libId.value}`, {
      query: { path: relPath.value },
    }),
  { watch: [libId, relPath] },
)

useHead({
  title: computed(() => data.value?.node?.title || ''),
})

const passwordInput = ref('')
const unlockError = ref<string | null>(null)
const unlocking = ref(false)
const onSubmitPassword = async () => {
  unlockError.value = null
  unlocking.value = true
  try {
    await $fetch(`/api/albums/scan/${libId.value}`, {
      method: 'POST',
      body: { password: passwordInput.value },
    })
    passwordInput.value = ''
    await refresh()
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number })?.statusCode
    unlockError.value =
      statusCode === 401
        ? $t('albums.scan.wrongPassword')
        : $t('albums.scan.unlockError')
  } finally {
    unlocking.value = false
  }
}

// 面包屑路径
const crumbs = computed(() => {
  const segs = [data.value?.node?.relPath || '']
    .join('/')
    .split('/')
    .filter(Boolean)
  return segs
})

// 轻量查看器状态（渲染交给 ScanPhotoViewer，其内部自行处理 WebGL 纹理加载与手势）
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
  <!-- 全宽展示容器：与首页画廊一致（edge-to-edge），照片从左右边缘贴边铺满 -->
  <div class="w-full pb-16">
    <!-- 顶部导航 / 标题区（带宽适内边距，照片瀑布流保持全宽） -->
    <div class="px-6 pt-6">
      <div class="mb-6 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
        <NuxtLink to="/albums" class="flex items-center gap-1 transition-colors hover:text-neutral-800 dark:hover:text-neutral-100">
          <Icon name="tabler:arrow-left" class="size-4" />
          <span>{{ $t('title.albums') }}</span>
        </NuxtLink>
        <template v-if="crumbs.length">
          <span>/</span>
          <NuxtLink
            v-for="(seg, i) in crumbs"
            :key="seg"
            :to="`/albums/scan/${libId}/${crumbs.slice(0, i + 1).join('/')}`"
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
      {{ $t('albums.scan.loading') }}
    </div>

    <div v-if="status !== 'pending' && !data" class="py-24 text-center text-neutral-400">
      {{ $t('albums.scan.notFound') }}
    </div>

    <div
      v-if="data?.passwordProtected && !data?.authorized"
      class="mx-auto max-w-md rounded-2xl border border-neutral-200 p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 bg-white"
    >
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="rounded-full bg-neutral-100 p-4 dark:bg-neutral-800">
          <Icon name="tabler:lock" class="size-8 text-neutral-500 dark:text-neutral-400" />
        </div>
        <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {{ $t('albums.scan.lockedTitle') }}
        </h2>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ $t('albums.scan.lockedHint') }}
        </p>
      </div>

      <form class="mt-6 space-y-3" @submit.prevent="onSubmitPassword">
        <UInput
          v-model="passwordInput"
          type="password"
          :placeholder="$t('albums.scan.passwordPlaceholder')"
          size="lg"
          :disabled="unlocking"
        />
        <p v-if="unlockError" class="text-sm text-red-500">
          {{ unlockError }}
        </p>
        <UButton
          type="submit"
          size="lg"
          class="w-full justify-center"
          icon="tabler:lock-open"
          :loading="unlocking"
        >
          {{ $t('albums.scan.unlock') }}
        </UButton>
      </form>
    </div>

    <template
      v-if="status !== 'pending' && !!data && (!data.passwordProtected || data.authorized)"
    >
      <!-- 嵌套子相簿（保留容器内边距以便卡片清晰展示） -->
      <div v-if="data!.children.length" class="mb-10 px-6">
        <h2 class="mb-4 text-base font-semibold text-neutral-700 dark:text-neutral-300">
          {{ $t('albums.scan.subAlbums') }}
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
                {{ child.photoCount }} {{ $t('albums.scan.photos') }}
              </p>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- 照片：与首页一致的全宽密铺瀑布流（edge-to-edge，无水平内边距） -->
      <div v-if="data!.dirPhotos.length">
        <h2 class="mb-4 px-6 text-base font-semibold text-neutral-700 dark:text-neutral-300">
          {{ $t('albums.scan.photos') }}
        </h2>
        <ClientOnly>
          <AlbumsScanMasonry :photos="data!.dirPhotos" @open="openPhoto" />
        </ClientOnly>
      </div>
      <p v-else-if="!data!.children.length" class="py-16 text-center text-neutral-400">
        {{ $t('albums.scan.empty') }}
      </p>
    </template>

    <!-- 纹理(WebGL)纹理查看器：与首页查看图画体验一致（仅客户端挂载，避免 SSR 环境无 document） -->
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

<style scoped></style>