<script setup lang="ts">
// 可复用的上传位置存储剩余进度条。
// 固定宽度（不随所在卡片/角标文字宽度变化），保证所有存储选项外观完全一致；
// 新增存储选项时直接复用本组件即可，无需再调整样式。
import { computed } from 'vue'

const props = defineProps<{
  // 剩余可用空间百分比（0~100，可传 null 表示未知/不可用）
  remaining: number | null
}>()

// 三色自动状态：剩余外观随剩余空间变化，颜色偏浅柔和系。
// remaining >= 50  => 充足（薄荷绿）
// remaining 20~50  => 适中（琥珀）
// remaining <  20  => 紧张（橙，不含红色）
const STATUS = {
  ok: { fill: '#58d2ae' },
  mid: { fill: '#fcd274' },
  low: { fill: '#fbaf6c' },
} as const

const status = computed(() => {
  const r = props.remaining
  if (r === null) return null
  if (r >= 50) return STATUS.ok
  if (r >= 20) return STATUS.mid
  return STATUS.low
})

// 百分比文字颜色：落在浅色填充上时用深绿，落在轨道上时用主题文字色
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
  { left: '18%', top: '18%', delay: '0s', duration: '1.7s', sm: false },
  { left: '38%', top: '62%', delay: '0.5s', duration: '2.1s', sm: false },
  { left: '60%', top: '26%', delay: '1s', duration: '1.4s', sm: false },
  { left: '78%', top: '68%', delay: '0.2s', duration: '1.9s', sm: false },
  { left: '93%', top: '34%', delay: '1.3s', duration: '1.6s', sm: true },
]
</script>

<template>
  <span
    v-if="status"
    class="upload-bar"
    :style="{ backgroundColor: 'rgba(15, 23, 42, 0.08)' }"
  >
    <span
      class="upload-bar__fill"
      :style="{
        width: `${clamped}%`,
        backgroundColor: status.fill,
      }"
    >
      <span class="upload-bar__flow" aria-hidden="true" />
      <span class="upload-bar__stars" aria-hidden="true">
        <i
          v-for="(s, i) in stars"
          :key="i"
          class="upload-bar__star"
          :class="{ 'upload-bar__star--sm': s.sm }"
          :style="{
            left: s.left,
            top: s.top,
            animationDelay: s.delay,
            animationDuration: s.duration,
          }"
        />
      </span>
    </span>
    <span class="upload-bar__label" :style="{ color: labelColor }">
      {{ Math.round(clamped) }}%
    </span>
  </span>
</template>

<style scoped>
/* 自适配宽度：填满所在文本列，但最宽不超过 220px。
   这样手机窄屏下不会比卡片可用宽度宽、不会从卡片框戳出去；
   桌面较宽时所有选项进度条都等宽为 220px。 */
.upload-bar {
  position: relative;
  display: block;
  width: 100%;
  max-width: 220px;
  height: 14px;
  overflow: hidden;
  border-radius: 999px;
}

/* 填充：前端为平直直线（直角），不继承轨道胶囊圆角；顶部保留一道极淡高光提升质感 */
.upload-bar__fill {
  position: absolute;
  inset: 0 0 0 0;
  left: 0;
  top: 0;
  bottom: 0;
  overflow: hidden;
  border-radius: 0;
  transition: width 0.7s ease-out;
}
.upload-bar__fill::after {
  content: '';
  position: absolute;
  inset: 0 0 54% 0;
  border-radius: 0;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.12) 0%,
    rgba(255, 255, 255, 0) 100%
  );
  pointer-events: none;
}

/* 内部流动：极淡斜向细纹。
   周期沿 120° 轴为 14px，屏幕水平方向一整个周期 = 14 / cos30° ≈ 16.17px，
   位移取 16.166px，循环无缝、不跳变，视觉上丝滑连续流动。 */
.upload-bar__flow {
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
.upload-bar__stars {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}
.upload-bar__star {
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
.upload-bar__star--sm {
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

.upload-bar__label {
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
}

@media (prefers-reduced-motion: reduce) {
  .upload-bar__flow,
  .upload-bar__star {
    animation: none;
    opacity: 1;
  }
}
</style>