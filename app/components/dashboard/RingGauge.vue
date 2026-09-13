<script setup lang="ts">
interface Segment {
  value: number
  from: string
  to: string
}

const props = withDefaults(
  defineProps<{
    segments: Segment[]
    size?: number
    stroke?: number
    gapDeg?: number
  }>(),
  { size: 80, stroke: 11, gapDeg: 4 },
)

const canvasRef = ref<HTMLCanvasElement>()
let raf = 0
let startTs = 0
const ANIM_MS = 900

function draw(progress: number) {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const size = props.size
  canvas.width = Math.round(size * dpr)
  canvas.height = Math.round(size * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)

  const dark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  const stroke = props.stroke
  const cx = size / 2
  const cy = size / 2
  const rMid = size / 2 - stroke / 2 - 1.5
  const total = props.segments.reduce((s, i) => s + i.value, 0)

  ctx.lineCap = 'round'

  // 简洁底环：细淡一圈，营造刻度座
  ctx.lineWidth = stroke
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)'
  ctx.beginPath()
  ctx.arc(cx, cy, rMid, 0, Math.PI * 2)
  ctx.stroke()

  if (!total || progress <= 0.0001) return

  // 主弧：纯色分段；缝隙为 0 时整环无缝闭合，段间用平头接缝区分颜色
  const gapRad = (props.gapDeg * Math.PI) / 180
  ctx.lineCap = props.gapDeg > 0 ? 'round' : 'butt'
  let start = -Math.PI / 2

  for (const seg of props.segments) {
    const frac = seg.value / total
    const sweep = frac * Math.PI * 2 * progress
    if (sweep <= 0.0001) continue

    const fromA = start + gapRad / 2
    const toA = start + sweep - gapRad / 2
    start += sweep
    if (toA <= fromA) continue

    ctx.lineWidth = stroke
    ctx.strokeStyle = seg.from
    ctx.beginPath()
    ctx.arc(cx, cy, rMid, fromA, toA)
    ctx.stroke()
  }
}

function animate(ts: number) {
  if (!startTs) startTs = ts
  const p = Math.min(1, (ts - startTs) / ANIM_MS)
  const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
  draw(eased)
  if (p < 1) raf = requestAnimationFrame(animate)
}

function run() {
  cancelAnimationFrame(raf)
  startTs = 0
  if (typeof window !== 'undefined') raf = requestAnimationFrame(animate)
}

onMounted(run)
onBeforeUnmount(() => cancelAnimationFrame(raf))

// 任一数值变化时重新成长期（在动画中看到比例生长）
watch(
  () => props.segments.map((s) => s.value).join(','),
  () => run(),
  { flush: 'post' },
)
</script>

<template>
  <div
    class="relative inline-block shrink-0"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
  >
    <canvas ref="canvasRef" class="h-full w-full" />
    <div
      class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-1.5 leading-none"
    >
      <slot />
    </div>
  </div>
</template>