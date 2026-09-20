<script lang="ts" setup>
// 随机照片盒 · 兼容模式动画 —— 面向老浏览器 / 低端设备的轻量过渡。
// 避免 preserve-3d、backdrop-filter 等高级能力：仅用 2D 位移/缩放/透明度，
// 用「快速翻牌」的方式在相册照片间轮换，最后定格并放大命中的一张。
// 样式全部走纯色背景 + 简单几何，任何现代浏览器都能流畅播放。
import { ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps<{
  open: boolean
  photos: { id: string; thumbnailUrl?: string | null; originalUrl?: string | null }[]
  target: number
}>()

const emit = defineEmits<{
  (e: 'done', index: number): void
  (e: 'cancel'): void
}>()

const SHUFFLE_MS = 360 // 翻牌切换间隔
const SHUFFLE_FRAMES = 9 // 翻牌次数
const LAND_HOLD = 900 // 定格后的停留时长，再平滑过渡打开照片

const show = ref(false)
const phase = ref<'idle' | 'shuffle' | 'land'>('idle')
const cardOrder = ref<{ thumb: string; full?: string; index: number }[]>([])
const settleIndex = ref(0)
const currentSlot = ref(0)
const winner = ref<{ thumb: string; full?: string; index: number } | null>(null)
// 状态机小节序号，驱动连贯的「翻牌→定格」布局
const stage = ref(0)

let shuffleTimer: ReturnType<typeof setTimeout> | null = null
let landTimer: ReturnType<typeof setTimeout> | null = null

function buildSample(count: number): { thumb: string; full?: string; index: number }[] {
  const pool: { thumb: string; full?: string; index: number }[] = []
  const seen = new Set<string>()
  props.photos.forEach((p, idx) => {
    if (!p?.thumbnailUrl || seen.has(p.thumbnailUrl)) return
    seen.add(p.thumbnailUrl)
    pool.push({ thumb: p.thumbnailUrl, full: p.originalUrl || undefined, index: idx })
  })
  for (let r = pool.length - 1; r > 0; r--) {
    const j = Math.floor(Math.random() * (r + 1))
    ;[pool[r], pool[j]] = [pool[j], pool[r]]
  }
  const n = Math.min(Math.max(3, count), pool.length, 12)
  return pool.slice(0, n)
}

function start() {
  stop()
  if (!props.photos.length) {
    emit('done', props.target)
    return
  }
  const cards = buildSample(12)
  if (!cards.length) {
    emit('done', props.target)
    return
  }
  cardOrder.value = cards
  settleIndex.value = Math.floor(Math.random() * cards.length)
  show.value = true
  phase.value = 'shuffle'
  stage.value = 0
  currentSlot.value = 0

  // 快速翻牌：按序号推进卡片，循环/随机跳转制造“扑克翻面”感
  let frame = 0
  shuffleTimer = setInterval(() => {
    frame++
    if (frame >= SHUFFLE_FRAMES) {
      clearInterval(shuffleTimer!)
      shuffleTimer = null
      onLand()
      return
    }
    // 翻牌顺序在样本内随机，偶尔回退，营造真实挑选感
    const jitter = Math.random() < 0.18 ? -1 : 1
    let next = currentSlot.value + (Math.random() < 0.3 ? 1 : jitter)
    if (next < 0) next = cardOrder.value.length - 1
    currentSlot.value = next % cardOrder.value.length
    stage.value = stage.value + 1
  }, SHUFFLE_MS)
}

function onLand() {
  phase.value = 'land'
  winner.value = cardOrder.value[settleIndex.value]
  landTimer = setTimeout(() => {
    stop()
    show.value = false
    emit('done', winner.value.index)
  }, LAND_HOLD)
}

function stop() {
  if (shuffleTimer) {
    clearInterval(shuffleTimer)
    shuffleTimer = null
  }
  if (landTimer) {
    clearTimeout(landTimer)
    landTimer = null
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && show.value) {
    stop()
    show.value = false
    phase.value = 'idle'
    emit('cancel')
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) start()
    else {
      stop()
      show.value = false
      phase.value = 'idle'
    }
  },
)

onBeforeUnmount(() => {
  stop()
  window.removeEventListener('keydown', handleKeydown)
})

window.addEventListener('keydown', handleKeydown)
</script>

<template>
  <Teleport to="body">
    <Transition name="compat">
      <div v-if="open && show" class="compat-overlay" role="status" aria-live="polite">
        <div class="compat-box" :class="{ 'compat-box--landing': phase === 'land' }">
          <!-- 推牌阶段的当前卡片 -->
          <Transition name="flip" appear>
            <img
              v-if="phase === 'shuffle' && cardOrder[currentSlot]"
              :key="`sh-${currentSlot}-${stage}`"
              :src="cardOrder[currentSlot].thumb"
              class="compat-card compat-card--shuffle"
              :alt="''"
            />
          </Transition>

          <!-- 定格阶段：命中照片放大居中 -->
          <Transition name="flip" appear>
            <img
              v-if="phase === 'land' && winner"
              :src="winner.full || winner.thumb"
              class="compat-card compat-card--winner"
              :alt="''"
            />
          </Transition>
        </div>

        <p class="compat-caption">
          <template v-if="phase === 'shuffle'">
            <Icon name="tabler:dots" class="compat-caption__icon" />
            随机照片盒 · 挑一张…
          </template>
          <template v-else>
            <Icon name="tabler:check" class="compat-caption__icon" />
            就这一张
          </template>
        </p>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.compat-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 18px;
  overflow: hidden;
  overscroll-behavior: contain;
  background: #f8f9fb; /* 纯色背景，不依赖 backdrop-filter */
  user-select: none;
  font-family: ui-sans-serif, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.compat-box {
  position: relative;
  width: min(88vw, 420px);
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(20, 24, 34, 0.16);
  overflow: hidden;
}

.compat-card {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

.compat-card--shuffle {
  transform: rotate(-1.6deg) scale(0.96);
}

.compat-box--landing .compat-card--winner {
  transform: scale(1.06);
  border-radius: 16px;
  box-shadow: 0 30px 70px rgba(20, 24, 34, 0.24);
}

.compat-caption {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7280;
  font-size: 13px;
}

.compat-caption__icon {
  color: #111318;
}

/* 翻牌切换：淡出+轻微缩放位移，纯 2D，兼容所有浏览器 */
.flip-enter-active,
.flip-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.flip-enter-from {
  opacity: 0;
  transform: scale(0.96);
}
.flip-leave-to {
  opacity: 0;
  transform: scale(1.04);
}

.compat-enter-active,
.compat-leave-active {
  transition: opacity 0.4s ease;
}
.compat-enter-from,
.compat-leave-to {
  opacity: 0;
}
</style>