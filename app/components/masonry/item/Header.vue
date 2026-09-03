<script lang="ts" setup>
const props = defineProps<{
  stats?: {
    total: number
    dateRange: {
      start: string | undefined
      end: string | undefined
    } | null
  }
  dateRangeText: string
}>()

const count = computed(() => props.stats?.total ?? 0)
const hasPhotos = computed(() => count.value > 0)
</script>

<template>
  <div class="w-full">
    <div
      class="glass-surface relative mx-auto w-fit max-w-full overflow-hidden rounded-xl px-4 py-2.5 shadow-[0_10px_28px_-14px_rgba(0,0,0,0.45)]"
    >
      <!-- 顶部发丝高光线（随主题） -->
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-(--glass-border) to-transparent"
      />
      <!-- 柔和辉光（随主题） -->
      <div
        class="pointer-events-none absolute -top-10 left-1/2 h-14 w-2/3 -translate-x-1/2 rounded-full bg-(--glass-chip) blur-2xl"
      />

      <div class="relative flex items-center gap-2.5">
        <!-- 左：日历图标座 -->
        <span
          class="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-(--glass-border) bg-(--glass-chip)"
        >
          <Icon
            name="tabler:calendar-time"
            class="size-3.5 text-(--glass-muted)"
          />
        </span>

        <!-- 中：文案（含日期范围与照片数量） -->
        <p
          v-if="hasPhotos"
          class="text-xs font-medium tracking-wide text-(--glass-muted)"
        >
          {{ $t('ui.stats.totalPhotosWithRange', { range: dateRangeText, count }) }}
        </p>
        <p
          v-else
          class="text-xs font-medium tracking-wide text-(--glass-faint)"
        >
          {{ $t('ui.stats.noPhotosTip') }}
        </p>

        <!-- 右：数量高亮点（随主题强调色） -->
        <span
          v-if="hasPhotos"
          class="-ml-0.5 inline-flex size-1.5 shrink-0 rounded-full bg-(--glass-accent)"
        />
      </div>
    </div>
  </div>
</template>