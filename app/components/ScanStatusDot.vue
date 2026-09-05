<script lang="ts" setup>
/**
 * 扫描库状态球：带脉冲波纹的彩色圆点。
 *  - 绿：目录运行正常（缩略图生成、相册轮询均正常）
 *  - 红：最近一次扫描存在失败项（failed > 0）
 *  - 灰：已停用
 */
const props = defineProps<{ enabled: boolean; raw?: string | null }>()

const failedCount = computed(() => {
  if (!props.raw) return 0
  const m = props.raw.match(/failed=(\d+)/i)
  return m ? Number(m[1]) : 0
})

const tone = computed(() => {
  if (!props.enabled) return 'off'
  return failedCount.value > 0 ? 'error' : 'ok'
})

const tipKey = computed(() => {
  if (tone.value === 'error') return 'settings.storage.scanLibrary.dotStatus.error'
  if (tone.value === 'off') return 'settings.storage.scanLibrary.dotStatus.off'
  return 'settings.storage.scanLibrary.dotStatus.ok'
})
</script>

<template>
  <UTooltip :text="$t(tipKey)">
    <span class="scan-status-dot" :data-tone="tone">
      <span class="scan-status-ring" aria-hidden="true"></span>
      <span class="scan-status-core"></span>
    </span>
  </UTooltip>
</template>

<style scoped>
.scan-status-dot {
  position: relative;
  display: inline-flex;
  width: 0.625rem;
  height: 0.625rem;
  flex-shrink: 0;
}
.scan-status-core {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  background: var(--sdot, #9ca3af);
}
.scan-status-ring {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: var(--sdot, #9ca3af);
  animation: scan-ripple 1.6s ease-out infinite;
  opacity: 0;
}
.scan-status-dot[data-tone='ok'] { --sdot: #10b981; }
.scan-status-dot[data-tone='error'] { --sdot: #ef4444; }
.scan-status-dot[data-tone='off'] { --sdot: #9ca3af; }

@keyframes scan-ripple {
  0% { transform: scale(0.5); opacity: 0.6; }
  100% { transform: scale(2.8); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .scan-status-ring { animation: none; opacity: 0.25; }
}
</style>