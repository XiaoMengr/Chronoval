<script lang="ts" setup>
// 独立随机相册页 · 兼容模式 —— 「随机照片盒动画=兼容」时跳转到这里。
// 用轻量翻牌动画（无 3D、无毛玻璃），兼容老浏览器；定格后打开选中照片并返回相簿。
import { ref, computed, onMounted } from 'vue'
import RandomCompatOverlay from '~/components/albums/RandomCompatOverlay.vue'

const route = useRoute()
const router = useRouter()

const albumId = computed(() => route.params.albumId as string)

const { data: album, error } = await useFetch(() => `/api/albums/${albumId.value}`, {
  watch: [albumId],
})

if (error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: $t('album.notFound'),
  })
}

const albumData = computed(() => album.value ?? null)

// 与相册详情页一致：按拍摄时间倒序、去重
const sortedAlbumPhotos = computed<Photo[]>(() => {
  const raw = (albumData.value?.photos as Photo[]) ?? []
  const seen = new Set<string>()
  const deduped = raw.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
  return [...deduped].sort((a, b) => {
    const ta = a.dateTaken ? new Date(a.dateTaken).getTime() : 0
    const tb = b.dateTaken ? new Date(b.dateTaken).getTime() : 0
    return tb - ta
  })
})

// 从 false 翻转 true，让内部 watcher 在挂载后触发 start()
const randomOpen = ref(false)
const randomTarget = ref(0)

onMounted(() => {
  randomOpen.value = true
})

function handleRandomDone(index: number) {
  const photos = sortedAlbumPhotos.value
  if (photos && photos[index]) {
    const { openViewer } = useViewerState()
    openViewer(index, `/albums/${albumId.value}`, photos as Photo[])
    router.replace(`/${photos[index].id}`)
  } else {
    router.replace(`/albums/${albumId.value}`)
  }
}

function handleRandomCancel() {
  router.back()
}
</script>

<template>
  <div class="compat-page">
    <RandomCompatOverlay
      :open="randomOpen"
      :photos="sortedAlbumPhotos"
      :target="randomTarget"
      @done="handleRandomDone"
      @cancel="handleRandomCancel"
    />
  </div>
</template>

<style scoped>
.compat-page {
  position: fixed;
  inset: 0;
  z-index: 30;
  overflow: hidden;
  background: linear-gradient(180deg, #f6f7f9, #eaecef);
}
</style>