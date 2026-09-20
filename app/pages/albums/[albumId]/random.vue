<script lang="ts" setup>
// 独立随机相册页 —— 点击相册详情页的「随机一张照片」跳转到这里。
// 整屏高斯模糊背景（用相册封面放大虚化），轮盘旋转 5 秒，落定后选中照片渐入，
// 随即调用全局查看器打开该照片，并回到相册详情页。
import { ref, computed, onMounted } from 'vue'
import RandomPreviewOverlay from '~/components/albums/RandomPreviewOverlay.vue'

const route = useRoute()
const router = useRouter()

const albumId = computed(() => route.params.albumId as string)

const {
  data: album,
  error,
  pending,
} = await useFetch(() => `/api/albums/${albumId.value}`, {
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

// 全屏背景用封面照片（虚化放大）
const coverPhoto = computed(() => {
  const current = albumData.value
  if (!current?.photos) return null
  if (current.coverPhotoId) {
    const cover = sortedAlbumPhotos.value.find((p: any) => p.id === current.coverPhotoId)
    if (cover) return cover
  }
  return sortedAlbumPhotos.value[0] || null
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
  <div class="random-page">
    <!-- 整屏高斯模糊背景：封面虚化作为底 -->
    <img
      v-if="coverPhoto?.thumbnailUrl"
      :src="coverPhoto.thumbnailUrl"
      class="random-page__bg"
      alt=""
      loading="eager"
      decoding="async"
    />
    <div class="random-page__veil" />

    <!-- 3D 旋转轮盘 -->
    <RandomPreviewOverlay
      :open="randomOpen"
      :photos="sortedAlbumPhotos"
      :target="randomTarget"
      @done="handleRandomDone"
      @cancel="handleRandomCancel"
    />
  </div>
</template>

<style scoped>
.random-page {
  position: fixed;
  inset: 0;
  z-index: 30;
  overflow: hidden;
  background: linear-gradient(180deg, #f6f7f9, #eaecef);
}

.random-page__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(48px) saturate(1.25) brightness(0.92);
  transform: scale(1.2);
}

.random-page__veil {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.32);
}
</style>