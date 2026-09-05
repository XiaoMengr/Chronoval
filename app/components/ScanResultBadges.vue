<script lang="ts" setup>
/**
 * 扫描结果徽章：把服务端原始字符串 `indexed=X updated=Y failed=Z`
 * 解析成可读的中文徽章（新增/更新/失败），失败 >0 时高亮为红色。
 * 三数全 0 时显示「本次无改动」。
 */
const props = defineProps<{ raw: string | null | undefined }>()

interface ScanNumbers {
  indexed: number
  updated: number
  failed: number
}

const parsed = computed<ScanNumbers | null>(() => {
  if (!props.raw) return null
  const m = props.raw.match(/indexed=(\d+)[\s,;]+updated=(\d+)[\s,;]+failed=(\d+)/i)
  if (!m) return null
  return { indexed: Number(m[1]), updated: Number(m[2]), failed: Number(m[3]) }
})

const allZero = computed(() => {
  const p = parsed.value
  return p && p.indexed === 0 && p.updated === 0 && p.failed === 0
})
</script>

<template>
  <span v-if="parsed" class="inline-flex flex-wrap items-center gap-1">
    <!-- 三数全 0：中性提示 -->
    <span
      v-if="allZero"
      class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
    >
      <UIcon name="tabler:check" class="size-3.5" />
      {{ $t('settings.storage.scanLibrary.result.noChange') }}
    </span>

    <!-- 逐项非零计数 -->
    <span
      v-if="parsed.indexed > 0"
      class="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400"
    >
      <UIcon name="tabler:download" class="size-3.5" />
      {{ $t('settings.storage.scanLibrary.result.new') }} {{ parsed.indexed }}
    </span>
    <span
      v-if="parsed.updated > 0"
      class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
    >
      <UIcon name="tabler:refresh" class="size-3.5" />
      {{ $t('settings.storage.scanLibrary.result.updated') }} {{ parsed.updated }}
    </span>
    <span
      v-if="parsed.failed > 0"
      class="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400"
    >
      <UIcon name="tabler:alert-circle" class="size-3.5" />
      {{ $t('settings.storage.scanLibrary.result.failed') }} {{ parsed.failed }}
    </span>
  </span>
</template>