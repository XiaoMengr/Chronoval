<script lang="ts" setup>
// 相簿背景音乐（BGM）浮层播放器
// 进入相簿自动尝试播放；浏览器拦截自动播放（无交互时）则降级为「待播放」态，
// 点击图标开始。提供播放/暂停 + 进度条，最小化不打扰浏览。
interface BgmInfo {
  url: string
  title: string
}

const props = defineProps<{
  bgm: BgmInfo | null
}>()

const emit = defineEmits<{ (e: 'toggle', playing: boolean): void }>()

const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const isPending = ref(false) // 尝试自动播放被拦截后，等待用户交互的状态
const isVisible = computed(() => !!props.bgm)
const progress = ref(0)
const duration = ref(0)

let playAttempted = false

const currentTitle = computed(() => props.bgm?.title || '')

const tryToStart = () => {
  const el = audioRef.value
  if (!el) return
  el.volume = 0.7
  el
    .play()
    .then(() => {
      isPlaying.value = true
      isPending.value = false
      emit('toggle', true)
    })
    .catch(() => {
      // 被浏览器自动播放策略拦截（无有效交互）→ 等待用户点击
      isPending.value = true
      isPlaying.value = false
      emit('toggle', false)
    })
}

const applyBgm = (bgm: BgmInfo | null) => {
  const el = audioRef.value
  if (!el) return
  if (!bgm) {
    el.pause()
    el.removeAttribute('src')
    el.load()
    isPlaying.value = false
    isPending.value = false
    progress.value = 0
    duration.value = 0
    playAttempted = false
    return
  }
  el.src = bgm.url
  el.load()
  if (playAttempted) return
  playAttempted = true
  // Gecko/Safari 中仍需事件循环以保证 src 就绪
  requestAnimationFrame(() => tryToStart())
}

// 组件挂载（此时 audioRef 已就绪）后再处理初始 BGM，避免 immediate watch 在模板 ref 挂载前提前返回
onMounted(() => applyBgm(props.bgm))

watch(
  () => props.bgm,
  (bgm) => {
    // 若尚未挂载（ref 仍为空），交给 onMounted 处理；
    // 已挂载则直接应用（含相簿切换 bgm 的场景）
    if (!audioRef.value) return
    applyBgm(bgm)
  },
)

const togglePlayback = () => {
  const el = audioRef.value
  if (!props.bgm || !el) return
  playAttempted = true
  if (isPlaying.value) {
    el.pause()
    isPlaying.value = false
    emit('toggle', false)
  } else {
    tryToStart()
  }
}

const onTimeUpdate = () => {
  const el = audioRef.value
  if (!el) return
  if (el.duration && Number.isFinite(el.duration)) duration.value = el.duration
  progress.value = el.currentTime
}

const onPause = () => {
  if (isPlaying.value) {
    isPlaying.value = false
    emit('toggle', false)
  }
}

const onPlay = () => {
  isPlaying.value = true
  isPending.value = false
  emit('toggle', true)
}

const onEnded = () => {
  isPlaying.value = false
  emit('toggle', false)
}

const formatTime = (s: number) => {
  if (!s || Number.isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

const pct = computed(() =>
  duration.value ? (progress.value / duration.value) * 100 : 0,
)

onBeforeUnmount(() => {
  const el = audioRef.value
  if (el) {
    el.pause()
    el.removeAttribute('src')
    el.load()
  }
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="isVisible"
      class="fixed bottom-4 left-4 z-[60] flex items-center gap-3 rounded-full border border-neutral-200/80 bg-white/85 py-2 pl-2 pr-3 shadow-lg backdrop-blur-md dark:border-neutral-700/80 dark:bg-neutral-900/85"
    >
      <audio
        ref="audioRef"
        class="hidden"
        :loop="true"
        @timeupdate="onTimeUpdate"
        @ended="onEnded"
        @play="onPlay"
        @pause="onPause"
      />

      <UButton
        :icon="isPlaying ? 'tabler:player-pause' : (isPending ? 'tabler:player-play' : 'tabler:player-play')"
        color="primary"
        variant="solid"
        size="md"
        :class="isPlaying ? 'animate-pulse' : ''"
        circle
        :aria-label="isPlaying ? $t('album.bgm.pause') : $t('album.bgm.play')"
        @click="togglePlayback"
      />

      <div class="min-w-0 max-w-[10rem] sm:max-w-[14rem]">
        <p class="flex items-center gap-1.5 truncate text-xs font-medium text-neutral-800 dark:text-neutral-100">
          <Icon v-if="isPlaying" name="tabler:disc" class="size-3.5 shrink-0 animate-spin text-primary-500" />
          <Icon v-else name="tabler:music" class="size-3.5 shrink-0 text-neutral-400" />
          <span class="truncate">{{ currentTitle }}</span>
        </p>
        <div class="group/bar relative mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
          <div
            class="absolute inset-y-0 left-0 rounded-full bg-primary-500 transition-[width] duration-200"
            :style="{ width: `${pct}%` }"
          />
        </div>
        <p class="mt-0.5 text-[10px] tabular-nums text-neutral-400">
          {{ formatTime(progress) }} / {{ formatTime(duration) }}
        </p>
      </div>

      <UTooltip :text="isPending ? $t('album.bgm.autoBlockedTip') : $t('album.bgm.loopOn')">
        <UBadge
          color="primary"
          variant="subtle"
          class="gap-1 px-1.5 py-0.5 text-[10px]"
          :label="formatTime(duration)"
        />
      </UTooltip>
    </div>
  </Transition>
</template>