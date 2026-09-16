<script lang="ts" setup>
import ScanAlbumView from '~/components/albums/ScanAlbumView.vue'

const route = useRoute()

const rawSlug = computed(() => route.params.slug as string)
const slug = computed<string[]>(() =>
  rawSlug.value ? [decodeURIComponent(rawSlug.value)] : [],
)
const slugKey = computed(() => slug.value[0] || '')

// 通过自定义 URL 别名解析出真实的扫描库 id 与相对路径
const {
  data,
  status,
  error,
} = await useAsyncData<{ libId: number; mount: string; relPath: string }>(
  `scan-album-slug-${slugKey.value}`,
  () =>
    $fetch<{ libId: number; mount: string; relPath: string }>(
      `/api/albums/scan-by-slug/${encodeURIComponent(slugKey.value)}`,
    ),
  { watch: [slugKey] },
)

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

  <!-- 直接渲染扫描相簿，URL 保持 /albums/s/{slug} 而非跳转到数字 id -->
  <ScanAlbumView
    v-else
    :lib-key="String(data.libId)"
    :rel-path="data.relPath"
    mode="slug"
  />
</template>