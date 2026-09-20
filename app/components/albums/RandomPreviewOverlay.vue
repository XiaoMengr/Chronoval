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
  /** 「随机照片轮经典语录」扩展功能是否开启；false=旋转时也不显示语录 */
  quotesEnabled?: boolean
  /** 最终生效的语录池（后端已按标签/自定义解析好）；空数组=不显示语录 */
  quotes?: string[]
}>()

const emit = defineEmits<{
  (e: 'done', index: number): void
  (e: 'cancel'): void
}>()

const SPIN_MS = 8000 // 轮盘旋转时长（放慢，转动更平顺持久）
const ZOOM_MS = 1700 // 停稳后：照片原尺寸出现 → 缓慢放大一点的时长
const FINAL_HOLD = 1100 // 定格后短暂停顿再平滑过渡打开照片
const MAX_CARDS = 16
const EASING = 'cubic-bezier(0.22, 0.5, 0.28, 1)'
const GAP = 0.5

// 旋转期间轮播的经典语录：由后端解析好的生效语录池驱动（见 buildQuotePool）

const show = ref(false)
const phase = ref<'idle' | 'spin' | 'zoom' | 'settled'>('idle')
// 当前展示的语录
const shownQuote = ref('')
// 本次旋转实际使用的语录池（相簿自定义优先，否则内置默认）
let activeQuotes: string[] = []
let quoteTimer: ReturnType<typeof setInterval> | null = null
const order = ref<{ thumb: string; full?: string; index: number }[]>([])
const winnerIndex = ref(0)
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

// 命中照片按视口计算的放大倍率（适配屏幕、居中）
const winScale = ref(1.6)

const reducedMotion = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

// —— 两阶段随机逻辑：
// 阶段一：从整张相簿中随机抽出「足够多而不撑爆」的照片放入轮盘（数量有上限 MAX_CARDS）。
// 阶段二：从轮盘内显示的照片里再随机选出一张作为本命照片 → emit 该照片在相簿中的下标。
// 这样相簿照片再多，轮盘也只面对固定的少量候选，不会因海量照片而卡顿或穿模。

// 卡片：携带其所属照片在相簿中的原始下标，命中后回传给父级打开正确照片。
type WheelCard = { thumb: string; full?: string; index: number }

function measure() {
  const el = stageRef.value
  if (!el) return
  const w = el.clientWidth
  // 轮盘卡片尺寸随屏幕自适应（略小以容纳更多照片）
  cardW.value = w >= 640 ? 118 : w >= 420 ? 98 : 78
  cardH.value = Math.round(cardW.value * 1.28)
  perspective.value = Math.max(1100, w * 2.2)

  // 命中照片放大到「适配屏幕、居中」：以视口高度/宽度为目标计算放大倍率。
  // 加大比例（高度 0.85 / 宽度 0.92），让照片尽量铺满屏幕更出效果。
  if (typeof window !== 'undefined') {
    const vh = window.innerHeight
    const vw = window.innerWidth
    let s = (vh * 0.85) / cardH.value
    const sw = (vw * 0.92) / cardW.value
    if (sw < s) s = sw
    winScale.value = Math.min(4.6, Math.max(1.5, s))
  }
}

// 沿用「最大半径铺满舞台、往外扩」的策略。
// 半径取舞台能容纳的最大值（RadiusMax = 舞台半径 - 卡宽/2），
// 再反推在「相邻卡片弦距 >= 卡宽 + 间距」约束下最多能放几张。
// 这样轮盘尽可能向外张大，卡片 3D 投影间距更大，不再在中心互相穿模。
function radiusMax(): number {
  const stageHalf = Math.max(0, ((stageRef.value?.clientWidth || 0) / 2) - 20)
  return Math.max(40, stageHalf - cardW.value / 2)
}

// 反推：以「相邻卡片弦距 = 卡宽 + 间距」排列在圆周上时的半径。
function spacingRadius(n: number): number {
  const gap = cardW.value * GAP
  const deg = (360 / n) * (Math.PI / 180)
  return (cardW.value + gap) / 2 / Math.sin(deg / 2)
}

// 完整 360° 均布轮盘的屏幕可容纳最大张数。
// 从 MAX_CARDS 往下取：若某张数的「间距半径」仍 ≤ 舞台可容纳半径，就可用。
// 照片多时据此铺到屏幕最多；照片少时取实际值（半径随之变小，密度与多张一致）。
function maxFitCount(totalAvailable: number): number {
  const R = radiusMax()
  if (R <= 0) return 1
  const limit = Math.min(MAX_CARDS, Math.max(1, totalAvailable))
  for (let n = limit; n >= 1; n--) {
    if (spacingRadius(n) <= R + 2) return n
  }
  return 1
}

// 阶段一：从全部照片中随机抽出 count 张（去重按缩略图），返回带原始下标的候选。
function buildSample(count: number): WheelCard[] {
  const pool: WheelCard[] = []
  const seen = new Set<string>()
  props.photos.forEach((p, idx) => {
    if (!p?.thumbnailUrl || seen.has(p.thumbnailUrl)) return
    seen.add(p.thumbnailUrl)
    pool.push({ thumb: p.thumbnailUrl, full: p.originalUrl || undefined, index: idx })
  })
  // 洗牌
  for (let r = pool.length - 1; r > 0; r--) {
    const j = Math.floor(Math.random() * (r + 1))
    ;[pool[r], pool[j]] = [pool[j], pool[r]]
  }
  return pool.slice(0, Math.min(count, pool.length))
}

function recomputeRadius() {
  const n = order.value.length
  if (n <= 1) {
    radius.value = Math.max(40, cardW.value * 0.9)
    return
  }
  // 完整均布轮盘：半径由「相邻卡片弦距 = 卡宽 + 间距」反过来确定，
  // 让卡片均匀分布在 360° 圆周上，无论照片多少间距都稳定一致。
  radius.value = spacingRadius(n)
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
  buildQuotePool() // 旋转期间在下方轮播经典语录
  if (props.quotesEnabled !== false && activeQuotes.length) startQuoteRotation()

  nextTick(() => {
    measure()
    // 默认先取一个较大概率：若相簿照片小于 MAX_CARDS 也会自动收缩
    const total = props.photos.length
    const count = maxFitCount(total)
    const sample = buildSample(count)
    if (!sample.length) {
      emit('done', props.target)
      show.value = false
      return
    }
    // 阶段二：从轮盘内显示的照片中随机选一张作为本命照片
    const winnerIdx = Math.floor(Math.random() * sample.length)
    const winner = sample[winnerIdx]
    winnerIndex.value = winner.index
    order.value = sample
    targetIndex.value = winnerIdx
    // 完整 360° 均布分列：所有卡片均匀铺满一整圈轮盘
    slots.value = order.value.length
      ? order.value.map((_, i) => (i / order.value.length) * 360)
      : []

    recomputeRadius()
    const n = order.value.length
    const degPerCard = n ? 360 / n : 0
    // 旋转使本命照片（targetIndex）恰好转到正前方 0°，落点无偏移
    const end = 720 - targetIndex.value * degPerCard
    // 留出 1~2 个整圈的余量，配合 ease-out 让轮盘转动更优雅、减速更自然
    const startDeg = end - Math.round(2 + Math.random() * 2) * 360
    wheelTransform.value = `rotateY(${startDeg}deg)`
    requestAnimationFrame(() => {
      wheelTransition.value = reducedMotion.value ? 'none' : `transform ${SPIN_MS}ms ${EASING}`
      wheelTransform.value = `rotateY(${end}deg)`
      timer = setTimeout(() => onZoom(), reducedMotion.value ? 30 : SPIN_MS)
    })
  })
}

function onZoom() {
  stopQuoteRotation() // 已停稳，不再轮播语录
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
  timer = setTimeout(done, reducedMotion.value ? 30 : FINAL_HOLD)
}

function done() {
  reset()
  emit('done', winnerIndex.value)
  show.value = false
}

function reset() {
  phase.value = 'idle'
  zoomActive.value = false
  wheelTransition.value = ''
}

function stop() {
  stopQuoteRotation()
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

// 旋转期间轮播语录：先随机展示一条，此后缓慢轮换（节奏舒缓，不抢戏）
function startQuoteRotation() {
  stopQuoteRotation()
  const pick = () => {
    if (!activeQuotes.length) return
    shownQuote.value = activeQuotes[Math.floor(Math.random() * activeQuotes.length)] || ''
  }
  pick()
  quoteTimer = setInterval(pick, 3800)
}

// 集结本次旋转实际使用的语录池：直接使用后端解析好的生效语录（空数组=不显示语录）
function buildQuotePool() {
  activeQuotes = (props.quotes || [])
    .map((s) => (s || '').trim())
    .filter(Boolean)
}

function stopQuoteRotation() {
  if (quoteTimer) {
    clearInterval(quoteTimer)
    quoteTimer = null
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

// 轮盘开启时锁定页面滚动，防止手指/滚轮把底部内容带上来看穿"覆盖全屏"的假象
function lockScroll(lock: boolean) {
  const el = document.body
  if (!el) return
  if (lock) {
    if (!('randLock' in el.dataset)) {
      el.dataset.randLock = el.style.overflow || ''
      el.style.overflow = 'hidden'
    }
  } else {
    if ('randLock' in el.dataset) {
      el.style.overflow = el.dataset.randLock || ''
      delete el.dataset.randLock
    }
  }
}

watch(
  () => props.open,
  (v) => {
    lockScroll(v)
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
  lockScroll(false)
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
        :style="{ '--rand-win-scale': winScale.value }"
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
          <div
            class="rand-wheel"
            :class="{ 'rand-wheel--quiet': zoomActive || phase === 'settled' }"
            :style="{ transform: wheelTransform, transition: wheelTransition }"
          >
            <!-- 隐形的滚筒底座：照片像贴在滚筒表面随转盘旋转 -->
            <div class="rand-drum" :style="{ '--drum-r': `${radius}px` }">
              <div class="rand-drum__ring" />
            </div>
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

        <!-- 旋转期间在轮盘下方轮播经典语录（扩展功能，可关闭） -->
        <p
          v-if="phase === 'spin' && props.quotesEnabled !== false && activeQuotes.length"
          class="rand-quote"
          aria-live="polite"
        >
          <Transition name="rand-quote" mode="out-in">
            <span :key="shownQuote" class="rand-quote__text">{{ shownQuote }}</span>
          </Transition>
        </p>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rand-overlay {
  --ink: #111318;
  --muted: #6b7280;
  --line: rgba(18, 22, 30, 0.10);
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
  overscroll-behavior: contain;
  /* 旋转期间：完全不透明的白色背景（绝不透出背后照片）+ 规则小圆点阵 */
  background: #f8f9fb;
  transition: background-color 0.7s ease;
  user-select: none;
  font-family: ui-sans-serif, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

/* 规则的小点点网格底纹 */
.rand-overlay::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(var(--line) 1.2px, transparent 1.2px);
  background-size: 46px 46px;
  pointer-events: none;
  transition: opacity 0.5s ease;
}

/* 选中的那一刻：白色底纹淡出，转为「白色高斯模糊(毛玻璃)」聚焦到照片。
   高不透明度白 + backdrop blur，绝不透明露图。backdrop-filter 仅作增强；
   不支持它的浏览器也因背景接近不透明而呈白色模糊观感。 */
.rand-overlay--zoom {
  background: rgba(248, 249, 251, 0.95);
  backdrop-filter: blur(36px) saturate(120%);
  -webkit-backdrop-filter: blur(36px) saturate(120%);
}

.rand-overlay--zoom::before {
  opacity: 0;
}

/* 浏览器兜底：完全不支持 backdrop-filter 时直接用近不透明白，杜绝透明露图 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .rand-overlay--zoom {
    background: rgba(248, 249, 251, 0.97);
  }
}

.rand-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
}

.rand-head__icon {
  font-size: 25px;
  color: var(--ink);
  animation: randSpin 1500ms linear infinite;
  opacity: 0.9;
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.rand-head__icon--soft {
  opacity: 0;
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
  color: var(--muted);
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

/* 选中放大阶段：允许命中照片超出舞台边界，配合居中放到适配屏幕大小 */
.rand-overlay--zoom .rand-scene {
  overflow: visible;
}

.rand-wheel {
  position: relative;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
}

/* 透明滚桶核心：一张极淡的 UV 环，提示照片像贴在滚筒表面旋转 */
.rand-drum {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
  opacity: 0.5;
  pointer-events: none;
}

.rand-drum__ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 200px;
  height: 260px;
  margin-left: -100px;
  margin-top: -130px;
  border: 1px dashed rgba(38, 40, 47, 0.12);
  border-radius: 34% / 12%;
  transform: rotateY(90deg) translateX(var(--drum-r));
}

.rand-card {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-style: preserve-3d;
  /* 滚筒透明：两侧的照片都可见——
     所有卡片贴在同一固定半径的滚筒表面，绕同一个轴旋转，
     3D 投影下背面卡片自然落在前面卡片之后，不会交叉穿模。 */
  backface-visibility: visible;
}

.rand-card__inner {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 16px 34px rgba(38, 40, 47, 0.22);
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

/* 命中后只保留选中照片：其余卡片完全隐藏，不留任何残留轮廓 */
.rand-wheel--quiet .rand-card:not(.rand-card--winner) {
  opacity: 0;
  filter: none;
  visibility: hidden;
  transition: opacity 0.45s ease;
}

/* 命中后隐藏滚筒虚线辅助环，界面只聚焦选中照片 */
.rand-wheel--quiet .rand-drum {
  opacity: 0;
  transition: opacity 0.45s ease;
}

.rand-card--winner {
  z-index: 20;
  opacity: 1;
  filter: none;
}

/* 中奖浮现：原尺寸柔和浮现后缓慢放大到适配屏幕尺寸（居中），再过渡打开照片 */
.rand-card__inner--active {
  box-shadow: none;
  animation: randReveal 1.5s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both;
}

@keyframes randReveal {
  from {
    opacity: 0;
    transform: scale(1);
  }
  to {
    opacity: 1;
    transform: scale(var(--rand-win-scale, 1.6));
  }
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
  color: var(--ink);
  animation: randPulse 1s ease-in-out infinite;
}

.rand-caption__accent {
  color: var(--ink);
  font-size: 16px;
}

/* 轮盘下方轮播的经典语录 */
.rand-quote {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: min(86vw, 560px);
  min-height: 22px;
  margin-top: 2px;
  text-align: center;
  font-size: 13px;
  line-height: 1.7;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--ink) 50%, transparent);
}

.rand-quote__text {
  position: relative;
  padding: 0 18px;
}

/* 语录引号装饰 */
.rand-quote__text::before,
.rand-quote__text::after {
  position: absolute;
  top: 0;
  font-size: 16px;
  line-height: 1;
  color: color-mix(in srgb, var(--ink) 26%, transparent);
}
.rand-quote__text::before {
  content: '“';
  left: 0;
}
.rand-quote__text::after {
  content: '”';
  right: 0;
}

/* 语录逐条淡入淡出（上下轻移） */
.rand-quote-enter-active,
.rand-quote-leave-active {
  transition: opacity 0.38s ease, transform 0.38s ease;
}
.rand-quote-enter-from {
  opacity: 0;
  transform: translateY(7px);
}
.rand-quote-leave-to {
  opacity: 0;
  transform: translateY(-7px);
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

@media (prefers-reduced-motion: reduce) {
  .rand-head__icon {
    animation: none !important;
  }
  .rand-wheel {
    transition: none !important;
  }
}
</style>