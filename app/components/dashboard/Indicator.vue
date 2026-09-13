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

// 单一强调色 + 内凹色块：图标落在一块低饱和柔和的色斑上，数值用墨黑/近白
// 双色调，去掉 AI 渐变，保持苹果风克制的层次感
const colorSchemes = {
  blue: {
    chip: 'bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  green: {
    chip: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  purple: {
    chip: 'bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  orange: {
    chip: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  red: {
    chip: 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  gray: {
    chip: 'bg-neutral-500/10 text-neutral-600 dark:bg-neutral-400/15 dark:text-neutral-300',
    dot: 'bg-neutral-500',
  },
  pink: {
    chip: 'bg-pink-500/10 text-pink-600 dark:bg-pink-400/15 dark:text-pink-300',
    dot: 'bg-pink-500',
  },
  yellow: {
    chip: 'bg-yellow-500/10 text-yellow-600 dark:bg-yellow-400/15 dark:text-yellow-300',
    dot: 'bg-yellow-500',
  },
}

const currentScheme = computed(() => colorSchemes[props.color])
</script>

<template>
  <div
    :class="[
      'flex items-center gap-3.5 rounded-xl border border-(--ui-border-accented) bg-(--ui-bg-elevated) py-4 pr-4 pl-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_1px_2px_rgba(20,20,24,0.04)]',
      'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.3)]',
      clickable
        ? 'cursor-pointer transition-transform duration-200 hover:-translate-y-0.5'
        : '',
    ]"
    @click="clickable ? emit('click') : undefined"
  >
    <span
      class="flex size-10 shrink-0 items-center justify-center rounded-lg"
      :class="currentScheme.chip"
    >
      <UIcon
        v-if="icon"
        :name="icon"
        class="size-5"
      />
    </span>
    <div class="min-w-0 flex-1">
      <p
        v-if="title"
        class="truncate text-xs font-medium text-(--ui-text-muted)"
      >
        {{ title }}
      </p>
      <p
        v-if="!isNil(value)"
        class="mt-0.5 truncate text-xl font-bold tabular-nums text-(--ui-text)"
      >
        {{ value }}
      </p>
    </div>
  </div>
</template>

<style scoped></style>