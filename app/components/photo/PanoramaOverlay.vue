<script lang="ts" setup>
import { motion, AnimatePresence } from 'motion-v'

const viewState = useViewerState()
const { isPanoramaViewerOpen, panoramaPhoto } = storeToRefs(viewState)
const { closePanoramaViewer } = viewState

// 照片信息卡片（复用普通照片查看器的 InfoPanel）
const infoOpen = ref(false)

// 切换照片时关闭信息卡片
watch(panoramaPhoto, () => {
  infoOpen.value = false
})

// 全景原图地址：优先大图，确保球面分辨率足够
const panoramaSrc = computed(() => {
  const p = panoramaPhoto.value
  return p?.originalUrl || ''
})

// Esc：先关信息卡片，再关闭全景查看器
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isPanoramaViewerOpen.value) {
    if (infoOpen.value) {
      infoOpen.value = false
    } else {
      closePanoramaViewer()
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <AnimatePresence>
      <motion.div
        v-if="isPanoramaViewerOpen && panoramaSrc"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.25 }"
        class="panorama-overlay fixed inset-0 z-[999] flex items-center justify-center"
        @click.self="closePanoramaViewer"
      >
        <div class="absolute inset-0 bg-[#050507]/90 backdrop-blur-xl" />

        <div class="relative z-10 flex h-svh w-full flex-col">
          <client-only>
            <PhotoPanoramaViewer
              :key="panoramaPhoto?.id"
              :src="panoramaSrc"
              :initial-yaw="panoramaPhoto?.panoYaw ?? 0"
              :initial-pitch="panoramaPhoto?.panoPitch ?? 0"
              class="h-full w-full"
            />
          </client-only>

          <button
            type="button"
            :aria-label="
              infoOpen ? 'collapse info' : 'expand info'
            "
            class="absolute left-5 top-5 z-20 flex size-11 items-center justify-center rounded-full border border-white/15 text-white/90 shadow-xl backdrop-blur-xl transition hover:bg-black/60"
            :class="infoOpen ? 'bg-black/60' : 'bg-black/40'"
            @click="infoOpen = !infoOpen"
          >
            <Icon
              :name="
                infoOpen
                  ? 'tabler:layout-sidebar-right-collapse'
                  : 'tabler:layout-sidebar-right-expand'
              "
              class="size-5"
            />
          </button>

          <button
            type="button"
            class="absolute right-5 top-5 z-20 flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/90 shadow-xl backdrop-blur-xl transition hover:bg-black/60"
            aria-label="close"
            @click="closePanoramaViewer"
          >
            <Icon name="tabler:x" class="size-5" />
          </button>

          <!-- 照片信息卡片：与普通照片查看器一致（桌面右侧抽屉 / 移动端底部弹层） -->
          <PhotoInfoPanel
            v-if="isPanoramaViewerOpen && panoramaPhoto"
            :key="panoramaPhoto.id"
            :current-photo="panoramaPhoto"
            :exif-data="panoramaPhoto.exif"
            :visible="infoOpen"
            :on-close="() => (infoOpen = false)"
            class="z-30"
          />

          <div class="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
            <div
              class="flex items-center gap-5 rounded-full border border-white/15 bg-black/45 px-5 py-2.5 text-[12px] text-white/85 shadow-xl backdrop-blur-xl"
            >
              <span class="flex items-center gap-1.5">
                <Icon name="tabler:hand-grab" class="size-4" />
                {{ $t('panorama.dragHint') }}
              </span>
              <span class="flex items-center gap-1.5">
                <Icon name="tabler:zoom-in" class="size-4" />
                {{ $t('panorama.zoomHint') }}
              </span>
              <span class="flex items-center gap-1.5">
                <Icon name="tabler:reload" class="size-4" />
                {{ $t('panorama.resetHint') }}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  </Teleport>
</template>

<style scoped></style>