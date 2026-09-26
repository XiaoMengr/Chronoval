<script lang="ts" setup>
/**
 * 相簿背景音乐（BGM）悬浮播放器。
 *
 * 进入相簿后，左侧栏中部出现一个透明的音乐图标（默认折叠隐藏态），
 * 可按住拖动到屏幕任意位置；点击图标展开为迷你播放器
 * （碟片旋转 + 标题 + 播放/暂停 + 进度条），再点击收起。
 *
 * 音源默认来自本地音乐盒（/api/music/{id}/stream，公开可访问）。
 */
interface BgmInfo {
  url: string
  title: string
}

const props = defineProps<{
  bgm: BgmInfo | null
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const isPending = ref(false) // 自动播放被拦截后等待用户点击
const isOpen = ref(false) // 是否展开为迷你播放器
const progress = ref(0)
const duration = ref(0)

let playAttempted = false

const isVisible = computed(() => !!props.bgm)
const currentTitle = computed(() => props.bgm?.title || '')

// ---- 拖动定位（默认左侧垂直居中） ----
const ICON_W = 44
const POS_X = ref(16)
const POS_Y = ref(0)

let dragStartX = 0
let dragStartY = 0
let dragMoved = false
const dragging = ref(false)
// 指针按下的起点是否在播放/暂停按钮上：若是，松开时不切换展开/收起（避免点按钮误开面板）
let suppressToggle = false
// 刚完成一次拖动：紧随其后的 click 不当作播放切换（拖动结束也会派发 click）
let justDragged = false

const clampPos = (x: number, y: number) => {
  const w = isOpen.value ? 300 : ICON_W
  const h = isOpen.value ? 190 : ICON_W
  const maxX = Math.max(0, window.innerWidth - w - 8)
  const maxY = Math.max(0, window.innerHeight - h - 8)
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  }
}

const syncInitialPos = () => {
  const p = clampPos(POS_X.value, (window.innerHeight - ICON_W) / 2)
  POS_X.value = p.x
  POS_Y.value = p.y
}

const onIconPointerDown = (e: PointerEvent) => {
  dragStartX = e.clientX - POS_X.value
  dragStartY = e.clientY - POS_Y.value
  dragMoved = false
  dragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
const onIconPointerMove = (e: PointerEvent) => {
  if (!dragging.value) return
  const nx = e.clientX - dragStartX
  const ny = e.clientY - dragStartY
  if (Math.abs(nx - POS_X.value) + Math.abs(ny - POS_Y.value) > 2) {
    dragMoved = true
  }
  const p = clampPos(nx, ny)
  POS_X.value = p.x
  POS_Y.value = p.y
}

const onIconPointerUp = () => {
  dragging.value = false
  const wasOnButton = suppressToggle
  suppressToggle = false
  justDragged = dragMoved
  // 拖动距离很小视为点击：切换展开/收起（点在播放/暂停按钮上时不触发）
  if (!dragMoved && !wasOnButton) {
    isOpen.value = !isOpen.value
  }
}

// ---- 音频控制 ----
const tryToStart = () => {
  const el = audioRef.value
  if (!el) return
  el.volume = 0.7
  el
    .play()
    .then(() => {
      isPlaying.value = true
      isPending.value = false
    })
    .catch(() => {
      // 浏览器自动播放策略拦截 → 等待用户点击
      isPending.value = true
      isPlaying.value = false
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
  requestAnimationFrame(() => tryToStart())
}

const togglePlayback = () => {
  const el = audioRef.value
  if (!props.bgm || !el) return
  if (justDragged) {
    // 拖动结束附带的 click，忽略
    justDragged = false
    return
  }
  justDragged = false
  playAttempted = true
  if (isPlaying.value) {
    el.pause()
    isPlaying.value = false
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

const onPlay = () => {
  isPlaying.value = true
  isPending.value = false
}

const onPause = () => {
  if (isPlaying.value) isPlaying.value = false
}

const onEnded = () => {
  isPlaying.value = false
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

onMounted(() => {
  syncInitialPos()
  window.addEventListener('resize', syncInitialPos)
  applyBgm(props.bgm)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncInitialPos)
  const el = audioRef.value
  if (el) {
    el.pause()
    el.removeAttribute('src')
    el.load()
  }
})

watch(
  () => props.bgm,
  (bgm) => {
    if (!audioRef.value) return
    applyBgm(bgm)
  },
)
</script>

<template>
  <audio
    ref="audioRef"
    class="hidden"
    :loop="true"
    @timeupdate="onTimeUpdate"
    @ended="onEnded"
    @play="onPlay"
    @pause="onPause"
  />

  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-3"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-3"
    >
      <div
        v-if="isVisible"
        class="fixed z-[60] touch-none select-none"
        :style="{ left: `${POS_X}px`, top: `${POS_Y}px` }"
        :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
      >
        <!-- 拖动手柄：默认折叠态的透明音乐图标 -->
        <div
          class="flex items-center gap-3 rounded-full border border-white/25 bg-black/25 p-1.5 backdrop-blur-xl shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-colors hover:bg-black/40"
          :class="isOpen ? 'bg-black/45 pr-3' : ''"
          @pointerdown="onIconPointerDown"
          @pointermove="onIconPointerMove"
          @pointerup="onIconPointerUp"
          @pointercancel="onIconPointerUp"
        >
          <!-- 图标按钮：按下时仅标记“起点在按钮上”，不阻断拖拽；点击只控制播放 -->
          <span
            class="grid size-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-red-500 to-red-700 text-white shadow-md"
            :class="isPlaying ? 'animate-pulse' : ''"
            :title="isPlaying ? $t('album.bgm.pause') : $t('album.bgm.play')"
            @pointerdown="suppressToggle = true"
            @click.stop="togglePlayback"
          >
            <Icon
              :name="isPlaying ? 'tabler:player-pause-filled' : 'tabler:player-play-filled'"
              class="size-4"
            />
          </span>

          <!-- 展开态内容：标题 + 进度 -->
          <div v-if="isOpen" class="min-w-0 w-52">
            <p class="flex items-center gap-1.5 truncate text-xs font-medium text-white">
              <Icon
                v-if="isPlaying"
                name="tabler:disc"
                class="size-3.5 shrink-0 animate-spin text-red-400"
              />
              <Icon v-else name="tabler:music" class="size-3.5 shrink-0 text-white/60" />
              <span class="truncate">{{ currentTitle }}</span>
            </p>
            <div class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/20">
              <div
                class="absolute inset-y-0 left-0 rounded-full bg-red-500 transition-[width] duration-200"
                :style="{ width: `${pct}%` }"
              />
            </div>
            <p class="mt-1 text-[10px] tabular-nums text-white/60">
              {{ formatTime(progress) }} / {{ formatTime(duration) }}
              <span v-if="isPending" class="ml-1 text-amber-300/90">
                {{ $t('album.bgm.autoBlockedTip') }}
              </span>
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
