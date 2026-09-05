<script lang="ts" setup>
defineProps<{
  label: string
  value?: string | number | null | undefined
  ellipsis?: boolean
}>()
</script>

<template>
  <div class="flex justify-between gap-4 text-sm">
    <span class="text-neutral-500 dark:text-neutral-400 shrink-0">{{ label }}</span>
    <span
      class="text-neutral-800 dark:text-neutral-100 min-w-0 text-right"
      :class="ellipsis ? 'truncate' : ''"
    >{{ value ?? '' }}</span>
  </div>
</template>