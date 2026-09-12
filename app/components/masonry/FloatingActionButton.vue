<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'

const props = defineProps<{
  showFloating: boolean
}>()

const isOpen = ref(false)
const router = useRouter()
const colorMode = useColorMode()

const isDark = computed(() => colorMode.value === 'dark')

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
  isOpen.value = false
}

function goMap() {
  router.push('/globe')
  isOpen.value = false
}

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
  isOpen.value = false
}

// 子按钮围绕主按钮向上扩散（Afilmory 风格）
const actions = computed(() => [
  {
    key: 'top',
    icon: 'tabler:arrow-up',
    label: $t('ui.action.backtotop.tooltip'),
    handle: scrollToTop,
    angle: -90,
  },
  {
    key: 'globe',
    icon: 'tabler:map-pin-2',
    label: $t('ui.action.globe.tooltip'),
    handle: goMap,
    angle: -38,
  },
  {
    key: 'theme',
    icon: isDark.value ? 'tabler:sun' : 'tabler:moon',
    label: $t('ui.action.theme.tooltip'),
    handle: toggleTheme,
    angle: -142,
  },
])

const RADIUS = 88

const actionStyle = (angle: number) => {
  const rad = (angle * Math.PI) / 180
  return {
    x: Math.cos(rad) * RADIUS,
    y: Math.sin(rad) * RADIUS,
  }
}
</script>

<template>
  <motion.div
    class="fixed right-4 bottom-6 z-50"
    :initial="{ opacity: 0, scale: 0.8 }"
    :animate="props.showFloating ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }"
    :transition="{ duration: 0.2 }"
    style="pointer-events: auto"
  >
    <!-- 主按钮 -->
    <button
      type="button"
      class="relative z-10 flex size-14 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/70 bg-linear-to-br from-white/20 to-white/0 p-3 text-white shadow-2xl backdrop-blur-2xl transition-colors duration-300 hover:border-white/30 hover:bg-black/85"
      :aria-label="$t('ui.action.more.label')"
      @click="isOpen = !isOpen"
    >
      <AnimatePresence mode="wait">
        <motion.span
          :key="isOpen ? 'close' : 'open'"
          :initial="{ opacity: 0, scale: 0.5, rotate: -90 }"
          :animate="{ opacity: 1, scale: 1, rotate: 0 }"
          :exit="{ opacity: 0, scale: 0.5, rotate: 90 }"
          :transition="{ duration: 0.18 }"
          class="inline-flex"
        >
          <Icon
            :name="isOpen ? 'tabler:x' : 'tabler:settings-2'"
            class="size-6"
          />
        </motion.span>
      </AnimatePresence>
    </button>

    <!-- 子按钮 -->
    <AnimatePresence>
      <template v-if="isOpen">
        <motion.button
          v-for="action in actions"
          :key="action.key"
          type="button"
          :initial="actionStyle(action.angle)"
          :animate="{ x: 0, y: 0 }"
          :exit="actionStyle(action.angle)"
          :transition="{ type: 'spring', stiffness: 300, damping: 22 }"
          class="absolute inset-0 flex size-14 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 shadow-xl backdrop-blur-xl transition-colors hover:bg-white/20 hover:text-white"
          :aria-label="action.label"
          @click="action.handle"
        >
          <Icon :name="action.icon" class="size-5" />
        </motion.button>
      </template>
    </AnimatePresence>
  </motion.div>
</template>

<style scoped></style>