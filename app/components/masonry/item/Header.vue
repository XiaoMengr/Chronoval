<script lang="ts" setup>
defineProps<{
  stats?: {
    total: number
    dateRange: {
      start: string | undefined
      end: string | undefined
    } | null
  }
  dateRangeText: string
}>()
</script>

<template>
  <div class="w-full">
    <div
      class="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-black/50 px-4 py-3 backdrop-blur-md"
    >
      <p
        v-if="stats?.total"
        class="text-xs font-medium text-white/70"
      >
        {{
          $t('ui.stats.totalPhotosWithRange', {
            range: dateRangeText,
            count: stats?.total,
          })
        }}
      </p>
      <p
        v-else
        class="text-xs font-medium text-white/50"
      >
        {{ $t('ui.stats.noPhotosTip') }}
      </p>
    </div>
  </div>
</template>

<style scoped></style>