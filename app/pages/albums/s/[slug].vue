<script lang="ts" setup>
const route = useRoute()

const slug = computed(() => (route.params.slug || []) as string[])

const { data, error } = await useAsyncData(
  () => `scan-album-slug-${slug.value.join('/')}`,
  () =>
    $fetch<{ libId: number; mount: string; relPath: string }>(
      `/api/albums/scan-by-slug/${encodeURIComponent(slug.value.join('/') || '')}`,
    ),
  { watch: [slug] },
)

// 解析成功则重定向到规范相簿地址
if (data.value) {
  const { libId, relPath } = data.value
  const pathSegs = relPath
    .split('/')
    .filter(Boolean)
    .map((s: string) => encodeURIComponent(s))
    .join('/')
  const target = `/albums/scan/${libId}${pathSegs ? '/' + pathSegs : ''}`
  await navigateTo(target, { replace: true })
}

useHead({
  title: () => $t('albums.scan.customUrlRedirect'),
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center p-8">
    <p class="text-neutral-500 dark:text-neutral-400">
      <template v-if="slug.length">{{ $t('albums.scan.redirecting') }}…</template>
      <template v-else>
        <UButton variant="link" :to="`/albums`">← {{ $t('albums.scan.backToAlbums') }}</UButton>
      </template>
    </p>
  </div>
</template>