<script lang="ts" setup>
import { motion, AnimatePresence } from 'motion-v'

const viewState = useViewerState()
const { isPanoramaViewerOpen, panoramaPhoto } = storeToRefs(viewState)
const { closePanoramaViewer } = viewState

// 全景原图地址：优先大图，确保球面分辨率足够
const panoramaSrc = computed(() => {
  const p = panoramaPhoto.value
  return p?.originalUrl || ''
})

// Esc 关闭
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isPanoramaViewerOpen.value) {
    closePanoramaViewer()
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
              :src="panoramaSrc"
              class="h-full w-full"
            />
          </client-only>

          <button
            type="button"
            class="absolute right-5 top-5 z-20 flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/90 shadow-xl backdrop-blur-xl transition hover:bg-black/60"
            aria-label="close"
            @click="closePanoramaViewer"
          >
            <Icon name="tabler:x" class="size-5" />
          </button>

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