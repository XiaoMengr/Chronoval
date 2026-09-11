<script setup lang="ts">
import { onMounted } from 'vue'

/**
 * 首页加载动画的三张卡片图片配置项。
 *
 * 数据模型：`string[]`（每项为图片 URL 或 base64 data URI）。
 * - 空数组（默认）= 使用液态 SVG 卡片（不带照片）。
 * - 1~3 项 = 依次显示为三张卡的封面。
 *
 * 提供给内置的「使用示例照片」预设，避免每次手动粘贴 URL。
 */
const BUILTIN_PRESETS = [
  '/loader/mountains_sm.jpg',
  '/loader/meadow_sm.jpg',
  '/loader/sea_sm.jpg',
]

interface Props {
  modelValue?: string[] | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const { t } = useI18n()

const items = ref<string[]>(['', '', ''])

const normalize = (raw: string[] | null | undefined): string[] => {
  const list = Array.isArray(raw) ? raw : []
  const arr = list
    .map((it) => (typeof it === 'string' ? it : (it as any)?.src ?? (it as any)?.url ?? ''))
    .filter((v) => typeof v === 'string')
    .slice(0, 3)
  while (arr.length < 3) arr.push('')
  return arr
}

watch(
  () => props.modelValue,
  (val) => {
    items.value = normalize(val)
  },
  { deep: true },
)

onMounted(() => {
  items.value = normalize(props.modelValue)
})

const hasPhotos = computed(() => items.value.some((it) => !!it.trim()))

const emitChange = () => {
  emit('update:modelValue', items.value.filter((it) => !!it.trim()))
}

const applyPreset = () => {
  items.value = [...BUILTIN_PRESETS]
  emitChange()
}

const clearAll = () => {
  items.value = ['', '', '']
  emitChange()
}

const removeAt = (index: number) => {
  items.value[index] = ''
  emitChange()
}

/**
 * 将选择的图片压缩为较小的 data URI（canvas 重绘），
 * 保证即便内联到设置里也不会拖慢前端。
 */
const onFilePicked = (index: number, input: HTMLInputElement) => {
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const MAX = 420
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        items.value[index] = reader.result as string
        emitChange()
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      items.value[index] = canvas.toDataURL('image/jpeg', 0.72)
      emitChange()
    }
    img.src = reader.result as string
  }
  reader.readAsDataURL(file)
}

const slotLabel = (index: number) =>
  t('settings.app.loader.images.slotLabel', { n: index + 1 })
</script>

<template>
  <div
    class="rounded-md border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/40"
  >
    <div class="space-y-1">
      <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {{ $t('settings.app.loader.images.label') }}
      </p>
      <p class="text-sm text-neutral-600 dark:text-neutral-400">
        {{ $t('settings.app.loader.images.description') }}
      </p>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <UButton
        size="sm"
        color="neutral"
        variant="soft"
        :icon="hasPhotos ? undefined : 'tabler:check'"
        @click="clearAll"
      >
        {{ $t('settings.app.loader.images.liquid') }}
      </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="soft"
        :icon="hasPhotos ? 'tabler:check' : undefined"
        @click="applyPreset"
      >
        {{ $t('settings.app.loader.images.preset') }}
      </UButton>

      <p class="ml-auto text-xs text-neutral-500 dark:text-neutral-500">
        {{ hasPhotos ? items.filter((it) => !!it.trim()).length + '/3' : '' }}
      </p>
    </div>

    <!-- 三张卡片槽位 -->
    <div class="mt-4 grid grid-cols-3 gap-3">
      <div
        v-for="(it, i) in items"
        :key="i"
        class="group relative aspect-[3/4] overflow-hidden rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700"
      >
        <img
          v-if="it"
          :src="it"
          :alt="slotLabel(i)"
          class="h-full w-full object-cover"
        />
        <div
          v-else
          class="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500/30 via-sky-400/30 to-fuchsia-400/30"
        >
          <span class="text-xs text-neutral-400 dark:text-neutral-500">
            {{ slotLabel(i) }}
          </span>
        </div>

        <label
          class="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/0 text-white/0 transition group-hover:bg-black/40 group-hover:text-white"
        >
          <span class="flex flex-col items-center gap-1 text-xs">
            <Icon name="tabler:upload" class="text-base" />
            <span>{{ $t('settings.app.loader.images.upload') }}</span>
          </span>
          <input
            type="file"
            accept="image/*"
            class="hidden"
            @change="onFilePicked(i, ($event.target as HTMLInputElement))"
          />
        </label>

        <UButton
          v-if="it"
          color="neutral"
          variant="solid"
          size="2xs"
          square
          icon="tabler:x"
          class="absolute right-1.5 top-1.5 opacity-0 transition group-hover:opacity-100"
          :aria-label="$t('common.actions.remove')"
          @click.stop="removeAt(i)"
        />
      </div>
    </div>

    <p class="mt-3 text-xs text-neutral-500 dark:text-neutral-500">
      {{ $t('settings.app.loader.images.help') }}
    </p>
  </div>
</template>

<style scoped></style>