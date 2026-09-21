<script lang="ts" setup>
// 扫描库相簿的公开 URL 标识路由（兼容旧的数字 id 链接）：
// /albums/scan/{urlKey}/{relPath...}
// urlKey 为 base36 时间戳或存量数字 id，实际渲染交给共享组件 ScanAlbumView。
import ScanAlbumView from '~/components/albums/ScanAlbumView.vue'

const route = useRoute()
const slug = computed(() => (route.params.slug || []) as string[])
// 第一段即公开标识：数字 id 或 urlKey 字符串
const libKey = computed(() => slug.value[0] || '')
const relPath = computed(() =>
  slug.value
    .slice(1)
    .map((s: string) => decodeURIComponent(s))
    .join('/'),
)
</script>

<template>
  <!-- 用 :key 强制子组件随「相簿标识 + 相对路径」整体重挂载：
       `/albums/scan/{urlKey}/{子路径...}` 属于同一个 catch-all 路由，若复用组件实例，
       useAsyncData 会在 key 变化时发生跨 key 竞态，导致点击三级相簿“没反应”或偶发 400/相簿不存在。
       以 key 重挂载可确保每次定位都走一次干净、无竞态的数据请求。 -->
  <ScanAlbumView
    v-if="libKey"
    :key="`${libKey}/${relPath}`"
    :lib-key="libKey"
    :rel-path="relPath"
    mode="scan"
  />
  <div
    v-else
    class="flex min-h-[40vh] items-center justify-center bg-white p-8 dark:bg-neutral-950"
  >
    <p class="text-neutral-400">{{ $t('albums.scan.notFound') }}</p>
  </div>
</template>