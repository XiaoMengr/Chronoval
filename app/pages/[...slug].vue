<script lang="ts" setup>
definePageMeta({
  layout: 'masonry',
  // 固定 key 防止路径参数变化时创建新的实例
  key: 'photo-viewer-route',
})

const route = useRoute()
const router = useRouter()

// 移动端禁止页面缩放（双指/双击），保持首页照片画廊的沉浸观感。
// 放在页面级头里以保证覆盖 Nuxt 的默认 viewport
useHead({
  meta: [
    {
      name: 'viewport',
      content:
        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
    },
  ],
})

const { switchToIndex, closeViewer, openViewer } = useViewerState()
const { isViewerOpen, scopedPhotos } = storeToRefs(useViewerState())

const { photos } = usePhotos()

const slug = computed(() => (route.params.slug as string[]) || [])
const photoId = computed(() => slug.value[0] || null)
const currentPhoto = computed(() =>
  photos.value.find((photo) => photo.id === photoId.value),
)

defineOgImage('Photo', {
  photo: currentPhoto.value || undefined,
  width: 1200,
  height: 628,
})

// 处理标签查询参数
const { clearAllFilters, toggleFilter } = usePhotoFilters()

// 监听路由查询参数中的标签
watch(
  () => route.query.tag,
  (tagParam) => {
    if (tagParam && typeof tagParam === 'string' && !photoId.value) {
      clearAllFilters()
      toggleFilter('tags', tagParam)

      router.replace('/')
    }
  },
  { immediate: true },
)

watch(
  [photoId, photos],
  ([currentPhotoId, globalPhotos]) => {
    if (!currentPhotoId) {
      closeViewer()
      useHead({
        title: '',
      })
      return
    }

    // An already-open session (album browsing, prev/next) keeps its current
    // photo scope; a fresh open (direct access or global gallery click) always
    // starts from the global list, and openViewer resets the scope.
    const activePhotos =
      isViewerOpen.value && scopedPhotos.value
        ? scopedPhotos.value
        : globalPhotos

    if (activePhotos.length === 0) return

    const foundIndex = activePhotos.findIndex(
      (photo) => photo.id === currentPhotoId,
    )
    if (foundIndex === -1) return

    useHead({
      title: activePhotos[foundIndex]?.title || $t('title.fallback.photo'),
    })

    if (!isViewerOpen.value) {
      // Direct access to a photo detail page: don't set a returnRoute (pass null)
      openViewer(foundIndex, null)
    } else {
      switchToIndex(foundIndex)
    }
  },
  { immediate: true },
)
</script>

<template>
  <div />
</template>

<style scoped></style>
