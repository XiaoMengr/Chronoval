<script setup lang="ts">
// 可复用的上传位置存储剩余进度条。
// 扁平极简风格：细条、胶囊圆角、平涂渐变填充；
// 保留用户要求的斜纹流动与柔和星光；三色自动状态反映剩余空间。
// 新增存储选项时直接复用本组件即可，无需再调整样式。
import { computed } from 'vue'

const props = defineProps<{
  // 剩余可用空间百分比（0~100，可传 null 表示未知/不可用）
  remaining: number | null
}>()

// 三色自动状态：每种状态用 亮→深 两色，生成从左到右的平涂渐变（与参考一致的薄荷→青绿感受）。
// remaining >= 50  => 充足（薄荷绿）
// remaining 20~50  => 适中（琥珀）
// remaining <  20  => 紧张（橙，不含红色）
const STATUS = {
  ok: { light: '#5DD8A8', deep: '#2EAF8F' },
  mid: { light: '#F5C86B', deep: '#E0A63C' },
  low: { light: '#F5A623', deep: '#E08E1F' },
} as const

const status = computed(() => {
  const r = props.remaining
  if (r === null) return null
  if (r >= 50) return STATUS.ok
  if (r >= 20) return STATUS.mid
  return STATUS.low
})

// 填充：从左到右的平涂渐变，扁平无高光无反光
const fillBackground = computed(() => {
  const s = status.value
  if (!s) return 'transparent'
  return `linear-gradient(90deg, ${s.light} 0%, ${s.deep} 100%)`
})

// 百分比文字颜色：落在浅色填充上时用深色，落在轨道上时用主题文字色
const labelColor = computed(() =>
  (props.remaining ?? 0) >= 50 ? '#0f5132' : 'var(--ui-text)',
)

// 统一以 0~100 的钳制数值参与渲染，避免剩余为空时的类型/渲染问题
const clamped = computed(() =>
  props.remaining === null
    ? 0
    : Math.max(0, Math.min(100, props.remaining)),
)

const stars = [
  { left: '18%', top: '20%', delay: '0s', duration: '1.7s', sm: false },
  { left: '38%', top: '66%', delay: '0.5s', duration: '2.1s', sm: false },
  { left: '60%', top: '28%', delay: '1s', duration: '1.4s', sm: false },
  { left: '78%', top: '70%', delay: '0.2s', duration: '1.9s', sm: false },
  { left: '93%', top: '36%', delay: '1.3s', duration: '1.6s', sm: true },
]
</script>

<template>
  <span v-if="status" class="upg">
    <span class="upg__track">
      <span
        class="upg__fill"
        :style="{ width: `${clamped}%`, background: fillBackground }"
      >
        <span class="upg__flow" aria-hidden="true" />
        <span class="upg__stars" aria-hidden="true">
          <i
            v-for="(s, i) in stars"
            :key="i"
            class="upg__star"
            :class="{ 'upg__star--sm': s.sm }"
            :style="{
              left: s.left,
              top: s.top,
              animationDelay: s.delay,
              animationDuration: s.duration,
            }"
          />
        </span>
      </span>
      <span class="upg__label" :style="{ color: labelColor }">
        {{ Math.round(clamped) }}%
      </span>
    </span>
  </span>
</template>

<style scoped>
/* 根容器：填满所在文本列，最宽 220px；
   手机窄屏下不会比卡片可用宽度宽、不从卡片框戳出去；
   桌面较宽时所有选项进度条都等宽为 220px。 */
.upg {
  display: block;
  width: 100%;
  max-width: 220px;
}

/* 数值文字：条内居中显示（勿放到条外） */
.upg__label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  white-space: nowrap;
}

/* 轨道：扁平浅中性色细条，胶囊圆角，无阴影 */
.upg__track {
  position: relative;
  display: block;
  height: 14px;
  overflow: hidden;
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--ui-text) 6%, transparent),
    color-mix(in srgb, var(--ui-text) 11%, transparent)
  );
}

/* 填充：平头直线（前端为直角，不继承轨道胶囊圆角），从左到右平涂渐变 */
.upg__fill {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 0;
  transition: width 0.7s ease-out;
}

/* 内部流动：极淡斜向细纹。
   周期沿 120° 轴为 14px，屏幕水平方向一整个周期 = 14 / cos30° ≈ 16.17px，
   位移取 16.166px，循环无缝、不跳变，视觉上丝滑连续流动。 */
.upg__flow {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: repeating-linear-gradient(
    120deg,
    rgba(255, 255, 255, 0) 0px,
    rgba(255, 255, 255, 0) 6px,
    rgba(255, 255, 255, 0.05) 6px,
    rgba(255, 255, 255, 0.05) 14px
  );
  animation: upgFlowX 1.8s linear infinite;
  pointer-events: none;
}
@keyframes upgFlowX {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 16.166px 0;
  }
}

/* 柔和闪烁的星光 */
.upg__stars {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}
.upg__star {
  position: absolute;
  width: 4px;
  height: 4px;
  margin-left: -2px;
  margin-top: -2px;
  border-radius: 50%;
  background: #fff;
  box-shadow:
    0 0 2px 0px rgba(255, 255, 255, 0.55),
    0 0 4px 1px rgba(255, 255, 255, 0.18);
  animation: upgTwinkle 2s ease-in-out infinite;
}
.upg__star--sm {
  width: 3px;
  height: 3px;
}
@keyframes upgTwinkle {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.6);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.05);
  }
}

@media (prefers-reduced-motion: reduce) {
  .upg__flow,
  .upg__star {
    animation: none;
    opacity: 1;
  }
}
</style>