<script lang="ts" setup>
import { motion, AnimatePresence } from 'motion-v'

const props = withDefaults(defineProps<{ src?: string }>(), {
  src: '/panorama/sample360.jpg',
})

const open = ref(false)

const entryShown = ref(false)
onMounted(() => {
  // 画廊视觉就绪后再浮现入口，避免首屏突兀
  setTimeout(() => {
    entryShown.value = true
  }, 640)
})
</script>

<template>
  <!-- 悬浮入口：玻璃胶囊 + 360 徽标，悬停展开小预览 -->
  <Transition
    enter-active-class="transition duration-500 ease-out"
    enter-from-class="opacity-0 translate-y-3"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition duration-300 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-3"
  >
    <button
      v-show="entryShown && !open"
      type="button"
      class="pano-entry group fixed bottom-6 right-6 z-40 flex cursor-pointer items-center gap-3 rounded-2xl border p-2 pr-4 shadow-2xl backdrop-blur-2xl transition-all hover:scale-[1.03] focus:outline-none"
      @click="open = true"
    >
      <span class="relative size-10 overflow-hidden rounded-xl">
        <img
          :src="props.src"
          alt="360° panorama preview"
          class="size-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <span class="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        <span class="absolute bottom-0.5 left-1 text-[8px] font-semibold text-white/90">
          360°
        </span>
      </span>
      <span class="flex flex-col items-start leading-tight">
        <span class="text-[13px] font-semibold">{{ $t('panorama.previewTitle') }}</span>
        <span class="text-[11px] text-(--glass-muted)">{{ $t('panorama.dragHintShort') }}</span>
      </span>
      <Icon
        name="tabler:karate"
        class="size-4 text-(--glass-muted)"
      />
    </button>
  </Transition>

  <!-- 全屏交互预览 -->
  <Teleport to="body">
    <AnimatePresence>
      <motion.div
        v-if="open"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.25 }"
        class="panorama-overlay fixed inset-0 z-[999] flex items-center justify-center"
        @click.self="open = false"
      >
        <!-- 深色遮罩 -->
        <div class="absolute inset-0 bg-[#050507]/90 backdrop-blur-xl" />

        <!-- 查看器容器 -->
        <div
          class="relative z-10 flex h-svh w-full flex-col"
        >
          <client-only>
            <PhotoPanoramaViewer
              :src="props.src"
              class="h-full w-full"
            />
          </client-only>

          <!-- 顶部关闭 -->
          <button
            type="button"
            class="absolute right-5 top-5 z-20 flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/90 shadow-xl backdrop-blur-xl transition hover:bg-black/60"
            aria-label="close"
            @click="open = false"
          >
            <Icon name="tabler:x" class="size-5" />
          </button>

          <!-- 底部提示 -->
          <div
            class="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center"
          >
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

<style scoped>
.pano-entry {
  background: var(--glass-bg);
  border-color: var(--glass-border);
  color: var(--glass-text);
}
</style>