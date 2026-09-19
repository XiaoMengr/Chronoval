<script lang="ts" setup>
import ScanAlbumView from '~/components/albums/ScanAlbumView.vue'

const route = useRoute()

type ResolveResult =
  | { kind: 'manual'; uid: string }
  | { kind: 'scan'; libId: number; mount: string; relPath: string }

const rawSlug = computed(() => route.params.slug as string)
const slug = computed<string[]>(() =>
  rawSlug.value ? [decodeURIComponent(rawSlug.value)] : [],
)
const slugKey = computed(() => slug.value[0] || '')

// 通过自定义 URL 别名解析归属：普通相簿走 uid 重定向，扫描相簿直接渲染
const {
  data,
  status,
  error,
} = await useAsyncData<ResolveResult>(
  `album-slug-${slugKey.value}`,
  () =>
    $fetch<ResolveResult>(
      `/api/albums/scan-by-slug/${encodeURIComponent(slugKey.value)}`,
    ),
  { watch: [slugKey] },
)

// 普通相簿的自定义别名命中 → 重定向到其规范 uid 地址
if (data.value?.kind === 'manual') {
  navigateTo(`/albums/${data.value.uid}`, { redirectCode: 302 })
}

useHead({
  title: () => $t('albums.scan.customUrlRedirect'),
})
</script>

<template>
  <div v-if="status === 'pending'" class="flex min-h-[40vh] items-center justify-center p-8">
    <p class="text-neutral-400">{{ $t('albums.scan.loading') }}</p>
  </div>

  <div v-else-if="error || !data" class="flex min-h-[40vh] items-center justify-center p-8">
    <p class="text-neutral-400">{{ $t('albums.scan.notFound') }}</p>
  </div>

  <!-- 扫描相簿：直接渲染，URL 保持 /albums/s/{slug} -->
  <ScanAlbumView
    v-else-if="data.kind === 'scan'"
    :lib-key="String(data.libId)"
    :rel-path="data.relPath"
    mode="slug"
  />

  <!-- 普通相簿：已被上方重定向，此处仅容错占位 -->
  <div v-else class="flex min-h-[40vh] items-center justify-center p-8">
    <p class="text-neutral-400">{{ $t('albums.scan.loading') }}</p>
  </div>
</template>