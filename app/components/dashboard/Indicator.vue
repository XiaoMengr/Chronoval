<script lang="ts" setup>
import { isNil } from 'es-toolkit'

const props = withDefaults(
  defineProps<{
    title?: string
    value?: string | number
    icon?: string
    color?: keyof typeof colorSchemes
    clickable?: boolean
  }>(),
  {
    title: undefined,
    value: undefined,
    icon: undefined,
    color: 'blue',
    clickable: false,
  },
)

const emit = defineEmits<{
  click: []
}>()

const colorSchemes = {
  blue: {
    background:
      'bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/70 dark:to-cyan-950/70',
    border: 'border-cyan-100 dark:border-cyan-900',
    text: 'text-blue-400 dark:text-white',
  },
  green: {
    background:
      'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/70 dark:to-emerald-950/70',
    border: 'border-emerald-100 dark:border-emerald-900',
    text: 'text-green-400 dark:text-white',
  },
  purple: {
    background:
      'bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-950/70 dark:to-violet-950/70',
    border: 'border-violet-100 dark:border-violet-900',
    text: 'text-purple-400 dark:text-white',
  },
  orange: {
    background:
      'bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/70 dark:to-amber-950/70',
    border: 'border-amber-100 dark:border-amber-900',
    text: 'text-orange-400 dark:text-white',
  },
  red: {
    background:
      'bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/70 dark:to-rose-950/70',
    border: 'border-rose-100 dark:border-rose-900',
    text: 'text-red-400 dark:text-white',
  },
  cyan: {
    background:
      'bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-950/70 dark:to-teal-950/70',
    border: 'border-teal-100 dark:border-teal-900',
    text: 'text-cyan-400 dark:text-white',
  },
  gray: {
    background:
      'bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-950/70 dark:to-slate-950/70',
    border: 'border-slate-100 dark:border-slate-900',
    text: 'text-gray-400 dark:text-white',
  },
  pink: {
    background:
      'bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950/70 dark:to-rose-950/70',
    border: 'border-rose-100 dark:border-rose-900',
    text: 'text-pink-400 dark:text-white',
  },
  yellow: {
    background:
      'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/70 dark:to-amber-950/70',
    border: 'border-amber-100 dark:border-amber-900',
    text: 'text-yellow-400 dark:text-white',
  },
}

const currentScheme = computed(() => colorSchemes[props.color])

/* ============================================================
   计数动画：把 value 中带数字的部分从 0 平滑跳动到实际值
   - 兼容两种入参：number（43 / 8）与带单位的字符串（"65.72 MB"）
   - 首次进入（挂载）从 0 开始；数值随后变化时从当前值过渡到新值
   ============================================================ */
type ParsedValue = {
  numeric: boolean
  target: number
  unit: string
  precision: number
}

const parseNumeric = (value: string | number | undefined): ParsedValue => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const precision = (String(value).split('.')[1] ?? '').length
    return { numeric: true, target: value, unit: '', precision }
  }
  if (typeof value === 'string' && value.trim()) {
    const m = value.trim().match(/^(-?\d[\d,]*\.?\d*)\s*(.*)$/)
    if (m) {
      const numStr = m[1].replace(/,/g, '')
      const target = parseFloat(numStr)
      if (Number.isFinite(target)) {
        const precision = (numStr.split('.')[1] ?? '').length
        return { numeric: true, target, unit: m[2].trim(), precision }
      }
    }
  }
  return { numeric: false, target: 0, unit: '', precision: 0 }
}

const parsed = computed(() => parseNumeric(props.value))

// 当前正在显示的数值（动画中间值）
const displayed = ref(0)

let raf = 0
const formatNum = (v: number, precision: number) =>
  precision > 0 ? v.toFixed(precision) : String(Math.round(v))

const displayText = computed(() => {
  if (!parsed.value.numeric) return props.value ?? ''
  return `${formatNum(displayed.value, parsed.value.precision)}${parsed.value.unit}`
})

// 缓动：easeOutCubic，先快后慢更自然
const animateTo = (target: number, from: number, duration = 1200) => {
  if (raf) cancelAnimationFrame(raf)
  const delta = target - from
  if (delta === 0) {
    displayed.value = target
    return
  }
  const startTime = performance.now()
  const step = (now: number) => {
    const p = Math.min((now - startTime) / duration, 1)
    const ease = 1 - Math.pow(1 - p, 3)
    displayed.value = from + delta * ease
    if (p < 1) raf = requestAnimationFrame(step)
    else raf = 0
  }
  raf = requestAnimationFrame(step)
}

// 首次挂载：从 0 开始跳动到实际值
onMounted(() => {
  const { numeric, target } = parsed.value
  if (!numeric) return
  animateTo(target, 0)
})

// 数值变化：从当前显示值平滑过渡到新值（如 30s 轮询刷新，不重新归零）
watch(
  () => parsed.value.target,
  (target, old) => {
    if (!parsed.value.numeric) return
    // 挂载首轮已由 onMounted 处理，这里跳过起始的 undefined
    if (old === undefined) return
    animateTo(target, displayed.value)
  },
)
</script>

<template>
  <div
    :class="[
      'indicator-enter flex justify-center border rounded-lg p-4',
      currentScheme.background,
      currentScheme.border,
      currentScheme.text,
      clickable
        ? 'cursor-pointer hover:scale-[1.01] transition-transform duration-200'
        : '',
    ]"
    @click="clickable ? emit('click') : undefined"
  >
    <div class="flex-1 flex items-center justify-between gap-4 overflow-hidden">
      <div class="flex-1 overflow-hidden">
        <p
          v-if="title"
          class="text-lg opacity-90 font-medium max-w-48 truncate"
        >
          {{ title }}
        </p>
        <p
          v-if="!isNil(value)"
          class="text-2xl font-bold tabular-nums max-w-full sm:max-w-1/2 truncate"
        >
          {{ displayText }}
        </p>
      </div>
      <UIcon
        v-if="icon"
        :name="icon"
        class="size-8 opacity-80"
      />
    </div>
  </div>
</template>

<style scoped>
/* 卡片渐入上浮：挂载时播放一次 */
.indicator-enter {
  animation: indicatorFadeUp 0.55s ease-out both;
}
@keyframes indicatorFadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 尊重系统的减少动态效果偏好 */
@media (prefers-reduced-motion: reduce) {
  .indicator-enter {
    animation: none;
  }
}
</style>