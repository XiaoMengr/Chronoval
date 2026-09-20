<script lang="ts" setup>
// 相簿随机预览过渡页 —— “3D 旋转相册轮”定稿版。
// 配色定为中性暖色（墨黑 + 琥珀点亮），告别蓝/紫。
// 所有几何量由 JS 测量舞台计算（单一数据源），支持极少数照片（1 张也能成轮）。
// 流程：轮盘旋转 5 秒减速停在正前方目标照片 → 该照片放大、背景高斯模糊转暖
// → 短暂停顿（倒计时 3 秒）后 emit('done', target) 由父级打开该照片。
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps<{
  open: boolean
  photos: { id: string; thumbnailUrl?: string | null; originalUrl?: string | null }[]
  target: number
}>()

const emit = defineEmits<{
  (e: 'done', index: number): void
  (e: 'cancel'): void
}>()

const SPIN_MS = 5000 // 轮盘旋转时长
const ZOOM_MS = 1600 // 停稳后放大+模糊时长
const FINAL_HOLD = 3000 // 停顿倒计时时长
const MAX_CARDS = 9
const EASING = 'cubic-bezier(0.2, 0.8, 0.22, 1)'
const GAP = 0.3 // 卡片间距 = 卡片宽的倍数，用于保证轮盘不过于紧凑

const show = ref(false)
const phase = ref<'idle' | 'spin' | 'zoom' | 'settled'>('idle')
const remaining = ref(0)
const order = ref<{ thumb: string; full?: string }[]>([])
const targetIndex = ref(0)

const stageRef = ref<HTMLElement | null>(null)
const cardW = ref(0)
const cardH = ref(0)
const radius = ref(0)
const perspective = ref(1400)
const slots = ref<number[]>([])

const wheelTransform = ref('')
const wheelTransition = ref('')
const zoomActive = ref(false)

const reducedMotion = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
let countdown: ReturnType<typeof setInterval> | null = null

function measure() {
  const el = stageRef.value
  if (!el) return
  const w = el.clientWidth
  // 轮盘更大：卡片尺寸随屏幕自适应
  cardW.value = w >= 640 ? 150 : w >= 420 ? 124 : 92
  cardH.value = Math.round(cardW.value * 1.28)
  perspective.value = Math.max(1100, w * 2.2)
}

// 在保证「卡片间距不被压缩」的前提下，推算出当前屏幕能放下多少张卡片。
// 半径由间距反推：radial(n) = (卡宽+间距) / (2·sin(π/n))，选出最大的 n 使其不超过舞台半径。
function maxFitCount(totalCandidates: number): number {
  const stageHalf = Math.max(0, ((stageRef.value?.clientWidth || 0) / 2) - 24)
  if (stageHalf <= 0) return 1
  const gap = cardW.value * GAP
  const denom = (2 * stageHalf) / (cardW.value + gap)
  if (denom <= 0) return 1
  const sinHalf = Math.min(1, 1 / denom)
  const radStep = Math.asin(sinHalf)
  let n = Math.floor(Math.PI / radStep)
  n = Math.min(MAX_CARDS, Math.max(1, n))
  // 不能超过候选数（避免填充太多重复造成拥挤观感）
  return Math.min(Math.max(1, totalCandidates), n)
}

function buildOrder(): { thumb: string; full?: string }[] {
  // 候选按「缩略图 + 高清原图」成对收集
  const pool: { thumb: string; full?: string }[] = []
  const seen = new Set<string>()
  const add = (p: (typeof props.photos)[number]) => {
    if (!p?.thumbnailUrl || seen.has(p.thumbnailUrl)) return
    seen.add(p.thumbnailUrl)
    pool.push({ thumb: p.thumbnailUrl, full: p.originalUrl || undefined })
  }
  add(props.photos[props.target])
  for (const p of props.photos) add(p)
  return pool
}

function recomputeRadius() {
  const n = order.value.length
  const stageHalf = Math.max(0, ((stageRef.value?.clientWidth || 0) / 2) - 24)
  if (n <= 1) {
    radius.value = Math.max(40, cardW.value * 0.9)
    return
  }
  // 由间距反推的最小半径（保证卡片不会相碰）
  const gap = cardW.value * GAP
  const step = (360 / n) * (Math.PI / 180)
  const radial = (cardW.value + gap) / 2 / Math.sin(step / 2)
  // 至少用上约 85% 的舞台半径：拉开轮盘、增大卡片间视线距离，避免旋转时穿模
  const spread = stageHalf * 0.85
  radius.value = Math.min(stageHalf, Math.max(radial, spread))
}

function start() {
  stop()
  if (!props.photos.length) {
    emit('done', props.target)
    return
  }
  phase.value = 'spin'
  zoomActive.value = false
  show.value = true

  nextTick(() => {
    measure()
    const pool = buildOrder()
    if (!pool.length) {
      emit('done', props.target)
      show.value = false
      return
    }
    // 依据当前屏幕可容纳数量切出轮盘照片（自适应 + 保留间距）
    const count = maxFitCount(pool.length)
    const targetCard = pool[0]
    // 目标始终放在下标 0（正前方命中位），其余按需截取并打乱
    const rest = pool.slice(1)
    for (let r = rest.length - 1; r > 0; r--) {
      const j = Math.floor(Math.random() * (r + 1))
      ;[rest[r], rest[j]] = [rest[j], rest[r]]
    }
    const take = rest.slice(0, Math.max(0, count - 1))
    order.value = [targetCard, ...take]
    targetIndex.value = 0
    slots.value = order.value.length
      ? order.value.map((_, i) => (i / order.value.length) * 360)
      : []

    recomputeRadius()
    const n = order.value.length
    const degPerCard = n ? 360 / n : 0
    const end = 720 - targetIndex.value * degPerCard
    const startDeg = end - Math.round(1 + Math.random() * 2) * 360
    wheelTransform.value = `rotateY(${startDeg}deg)`
    requestAnimationFrame(() => {
      wheelTransition.value = reducedMotion.value ? 'none' : `transform ${SPIN_MS}ms ${EASING}`
      wheelTransform.value = `rotateY(${end}deg)`
      timer = setTimeout(() => onZoom(), reducedMotion.value ? 30 : SPIN_MS)
    })
  })
}

function onZoom() {
  if (reducedMotion.value) {
    finish()
    return
  }
  phase.value = 'zoom'
  zoomActive.value = true
  timer = setTimeout(finish, ZOOM_MS)
}

function finish() {
  phase.value = 'settled'
  remaining.value = Math.round(FINAL_HOLD / 1000)
  stopCountdown()
  countdown = setInterval(() => {
    remaining.value -= 1
  }, 1000)
  timer = setTimeout(done, reducedMotion.value ? 30 : FINAL_HOLD)
}

function done() {
  reset()
  emit('done', props.target)
  show.value = false
}

function reset() {
  phase.value = 'idle'
  zoomActive.value = false
  remaining.value = 0
  wheelTransition.value = ''
  stopCountdown()
}

function stop() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  stopCountdown()
}

function stopCountdown() {
  if (countdown) {
    clearInterval(countdown)
    countdown = null
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && show.value) {
    stop()
    show.value = false
    reset()
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
      reset()
    }
  },
)

let ro: ResizeObserver | null = null
onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.addEventListener('keydown', handleKeydown)
  if (stageRef.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measure())
    ro.observe(stageRef.value)
  }
})

onBeforeUnmount(() => {
  stop()
  window.removeEventListener('keydown', handleKeydown)
  ro?.disconnect()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="rand">
      <div
        v-if="open && show"
        class="rand-overlay"
        role="status"
        aria-live="polite"
        :class="{ 'rand-overlay--zoom': zoomActive || phase === 'settled' }"
      >
        <div class="rand-head">
          <Icon
            name="tabler:shuffle"
            class="rand-head__icon"
            :class="{ 'rand-head__icon--soft': phase !== 'spin' }"
          />
          <span
            class="rand-head__label"
            :class="{ 'rand-head__label--soft': phase !== 'spin' }"
          >
            {{ phase === 'settled' ? '就这一张' : '随机照片轮' }}
          </span>
        </div>

        <!-- 3D 轮盘 -->
        <div
          ref="stageRef"
          class="rand-scene"
          :style="{ perspective: `${perspective}px` }"
        >
          <!-- 落定后的暖色光晕 -->
          <div class="rand-halo" :class="{ 'rand-halo--on': zoomActive || phase === 'settled' }" />
          <div
            class="rand-wheel"
            :class="{ 'rand-wheel--quiet': zoomActive || phase === 'settled' }"
            :style="{ transform: wheelTransform, transition: wheelTransition }"
          >
            <div
              v-for="(card, i) in order"
              :key="`${i}-${card.thumb}`"
              class="rand-card"
              :class="{ 'rand-card--winner': i === targetIndex }"
              :style="{
                width: `${cardW}px`,
                height: `${cardH}px`,
                marginLeft: `${-cardW / 2}px`,
                marginTop: `${-cardH / 2}px`,
                transform: `rotateY(${slots[i] || 0}deg) translateZ(${radius}px)`,
              }"
            >
              <div
                class="rand-card__inner"
                :class="{ 'rand-card__inner--active': (zoomActive || phase === 'settled') && i === targetIndex }"
              >
                <!-- 命中后用高清原图，旋转阶段用缩略图保证流畅 -->
                <img
                  v-if="card"
                  :src="(zoomActive || phase === 'settled') && i === targetIndex && card.full ? card.full : card.thumb"
                  :alt="''"
                  class="rand-card__img"
                  loading="lazy"
                  decoding="async"
                />
                <div v-else class="rand-card__empty">
                  <Icon name="tabler:photo" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <Transition name="thumb" mode="out-in">
          <div v-if="phase === 'settled'" class="rand-countdown">
            <svg class="rand-countdown__ring" viewBox="0 0 44 44" aria-hidden="true">
              <circle cx="22" cy="22" r="19" class="rand-countdown__track" />
              <circle cx="22" cy="22" r="19" class="rand-countdown__bar" />
            </svg>
            <span class="rand-countdown__num">{{ remaining }}</span>
          </div>
        </Transition>

        <p class="rand-caption">
          <template v-if="phase === 'spin'">
            <Icon name="tabler:dots" class="rand-caption__dots" />
            轮盘转起来，稍候…
          </template>
          <template v-else-if="phase === 'zoom'">
            <Icon name="tabler:zoom-in" class="rand-caption__accent" />
            定格这张照片
          </template>
          <template v-else-if="phase === 'settled'">
            <Icon name="tabler:check" class="rand-caption__accent" />
            即将为你打开这张照片
          </template>
        </p>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rand-overlay {
  --ink: #26282f;
  --muted: #6d7280;
  --amber: #f0913f;
  --amber-soft: rgba(240, 145, 63, 0.42);
  --line: rgba(38, 40, 47, 0.1);
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 18px;
  overflow: hidden;
  background:
    radial-gradient(130% 130% at 50% 0%, rgba(240, 145, 63, 0.14), transparent 55%),
    linear-gradient(180deg, #fafbfc, #f0f2f6 60%, #e9ecf1);
  user-select: none;
  font-family: ui-sans-serif, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  transition: background 0.7s ease;
}

/* 命中后背景柔化变暖 */
.rand-overlay--zoom {
  background:
    radial-gradient(130% 130% at 50% 0%, rgba(240, 145, 63, 0.24), transparent 58%),
    linear-gradient(180deg, #f3ece2, #e7dccd 60%, #ded1c0);
}

.rand-overlay::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(var(--line) 1px, transparent 1px);
  background-size: 42px 42px;
  pointer-events: none;
}

.rand-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
}

.rand-head__icon {
  font-size: 25px;
  color: var(--amber);
  animation: randSpin 1500ms linear infinite;
  filter: drop-shadow(0 0 10px rgba(240, 145, 63, 0.35));
  transition: filter 0.4s ease, transform 0.4s ease;
}

.rand-head__icon--soft {
  filter: none;
  animation: none;
  transform: scale(0.9);
}

.rand-head__label {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink);
  transition: color 0.4s ease;
}

.rand-head__label--soft {
  color: var(--amber);
}

/* 3D 舞台：更大 */
.rand-scene {
  position: relative;
  width: min(96vw, 640px);
  height: 360px;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.rand-halo {
  position: absolute;
  inset: 8%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(240, 145, 63, 0.28), rgba(240, 145, 63, 0.08) 55%, transparent 72%);
  opacity: 0;
  transform: scale(0.7);
  transition: opacity 0.6s ease, transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}

.rand-halo--on {
  opacity: 1;
  transform: scale(1);
}

.rand-wheel {
  position: relative;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
}

.rand-card {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-style: preserve-3d;
  backface-visibility: visible;
}

.rand-card__inner {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 16px 34px rgba(38, 40, 47, 0.22), inset 0 0 0 1px rgba(255, 255, 255, 0.7);
}

.rand-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rand-card__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 34px;
  color: #cdd2dd;
}

/* 命中：其余卡片转淡模糊，命中卡片保持清晰并放大 */
.rand-wheel--quiet .rand-card:not(.rand-card--winner) {
  opacity: 0.12;
  filter: blur(4px);
}

.rand-card--winner {
  z-index: 20;
  opacity: 1;
  filter: none;
}

.rand-card__inner--active {
  transform: scale(1.28);
  box-shadow: 0 40px 90px rgba(38, 40, 47, 0.5), 0 0 0 4px rgba(240, 145, 63, 0.7);
  transition: transform 1.1s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.8s ease;
}

.rand-countdown {
  position: relative;
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
}

.rand-countdown__ring {
  position: absolute;
  inset: 0;
  width: 52px;
  height: 52px;
  transform: rotate(-90deg);
}

.rand-countdown__track {
  fill: none;
  stroke: rgba(240, 145, 63, 0.2);
  stroke-width: 3;
}

.rand-countdown__bar {
  fill: none;
  stroke: var(--amber);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 119.38;
  stroke-dashoffset: 0;
  animation: countdown 3s linear forwards;
}

.rand-countdown__num {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.rand-caption {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}

.rand-caption__dots {
  font-size: 18px;
  color: var(--amber);
  animation: randPulse 1s ease-in-out infinite;
}

.rand-caption__accent {
  color: var(--amber);
  font-size: 16px;
}

.rand-enter-active,
.rand-leave-active {
  transition: opacity 0.4s ease;
}
.rand-enter-from,
.rand-leave-to {
  opacity: 0;
}
.rand-enter-active .rand-head {
  animation: randFadeUp 0.4s ease 0.05s both;
}
.rand-enter-active .rand-scene {
  animation: randSceneIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.thumb-enter-active,
.thumb-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.thumb-enter-from,
.thumb-leave-to {
  opacity: 0;
  transform: scale(0.7);
}

@keyframes randSceneIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}
@keyframes randFadeUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
@keyframes randSpin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes randPulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}
@keyframes countdown {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: 119.38;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rand-head__icon {
    animation: none !important;
  }
  .rand-wheel {
    transition: none !important;
  }
}
</style>