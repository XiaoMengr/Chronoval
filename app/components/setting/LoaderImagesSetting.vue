<script setup lang="ts">
import { onMounted } from 'vue'

/**
 * 首页加载动画配置项。
 *
 * 三个关联配置：
 * - images (string[])：三张卡片图片 URL / data URI，留空则用卡片样式内置图形。
 * - cardStyle ('liquid' | 'skeuo')：卡片样式。liquid=液态玻璃，skeuo=拟物化卡片。
 * - animation ('stack' | 'fan')：卡片动画样式。
 */
const BUILTIN_PRESETS = [
  '/loader/mountains_sm.jpg',
  '/loader/meadow_sm.jpg',
  '/loader/sea_sm.jpg',
]

const CARD_STYLES = ['liquid', 'skeuo'] as const
const ANIM_STYLES = ['stack', 'fan'] as const

interface Props {
  modelValue?: string[] | null
  cardStyle?: 'liquid' | 'skeuo' | null
  animation?: 'stack' | 'fan' | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  'update:cardStyle': [value: 'liquid' | 'skeuo']
  'update:animation': [value: 'stack' | 'fan']
}>()

const { t } = useI18n()
const toast = useToast()

const items = ref<string[]>(['', '', ''])
const urlDrafts = ref<string[]>(['', '', ''])

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
    const normalized = normalize(val)
    items.value = normalized
    urlDrafts.value = normalized.map((it) =>
      it.startsWith('data:') ? '' : it,
    )
  },
  { deep: true },
)

onMounted(() => {
  const normalized = normalize(props.modelValue)
  items.value = normalized
  urlDrafts.value = normalized.map((it) =>
    it.startsWith('data:') ? '' : it,
  )
})

const hasPhotos = computed(() => items.value.some((it) => !!it.trim()))

const emitChange = () => {
  emit('update:modelValue', items.value.filter((it) => !!it.trim()))
}

const applyPreset = () => {
  items.value = [...BUILTIN_PRESETS]
  urlDrafts.value = [...BUILTIN_PRESETS]
  emitChange()
}

const clearAll = () => {
  items.value = ['', '', '']
  urlDrafts.value = ['', '', '']
  emitChange()
}

const removeAt = (index: number) => {
  items.value[index] = ''
  urlDrafts.value[index] = ''
  emitChange()
}

const applyUrlAt = (index: number) => {
  const url = (urlDrafts.value[index] || '').trim()
  if (!url) {
    toast.add({
      title: t('settings.app.loader.images.urlEmpty'),
      color: 'error',
    })
    return
  }
  items.value[index] = url
  emitChange()
}

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
        urlDrafts.value[index] = ''
        emitChange()
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      items.value[index] = canvas.toDataURL('image/jpeg', 0.72)
      urlDrafts.value[index] = ''
      emitChange()
    }
    img.src = reader.result as string
  }
  reader.readAsDataURL(file)
}

const setCardStyle = (style: 'liquid' | 'skeuo') => {
  emit('update:cardStyle', style)
}
const setAnimation = (style: 'stack' | 'fan') => {
  emit('update:animation', style)
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

    <!-- 卡片样式：液态玻璃（默认） / 拟物化卡片 -->
    <div class="mt-4 space-y-1.5">
      <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {{ $t('settings.app.loader.cardStyle.label') }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-for="style in CARD_STYLES"
          :key="style"
          size="sm"
          color="neutral"
          :variant="props.cardStyle === style ? 'solid' : 'soft'"
          :icon="style === 'skeuo' ? 'tabler:circle-dot' : 'tabler:droplet'"
          @click="setCardStyle(style)"
        >
          {{ $t(`settings.app.loader.cardStyle.${style}`) }}
        </UButton>
      </div>
      <p class="text-xs text-neutral-500 dark:text-neutral-500">
        {{ $t('settings.app.loader.cardStyle.help') }}
      </p>
    </div>

    <!-- 动画样式：叠放轮回 / 扇形展开 -->
    <div class="mt-4 space-y-1.5">
      <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {{ $t('settings.app.loader.animation.label') }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-for="style in ANIM_STYLES"
          :key="style"
          size="sm"
          color="neutral"
          :variant="props.animation === style ? 'solid' : 'soft'"
          :icon="style === 'fan' ? 'tabler:columns-3' : 'tabler:layers-intersect'"
          @click="setAnimation(style)"
        >
          {{ $t(`settings.app.loader.animation.${style}`) }}
        </UButton>
      </div>
      <p class="text-xs text-neutral-500 dark:text-neutral-500">
        {{ $t('settings.app.loader.animation.help') }}
      </p>
    </div>

    <div class="mt-5 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
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

    <!-- 三张卡片槽位：每张支持上传或填写 URL -->
    <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div
        v-for="(it, i) in items"
        :key="i"
        class="space-y-2"
      >
        <div
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
            <span class="px-2 text-center text-xs text-neutral-400 dark:text-neutral-500">
              {{ slotLabel(i) }} · {{ $t('settings.app.loader.images.upload') }}
            </span>
          </div>

          <label
            class="absolute inset-x-0 bottom-0 flex cursor-pointer items-center justify-center gap-1 bg-black/55 py-2 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
          >
            <Icon name="tabler:upload" class="text-sm" />
            <span>{{ $t('settings.app.loader.images.upload') }}</span>
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
            class="absolute right-1.5 top-1.5"
            :aria-label="$t('common.actions.remove')"
            @click.stop="removeAt(i)"
          />
        </div>

        <div class="flex gap-1.5">
          <UInput
            v-model="urlDrafts[i]"
            size="sm"
            :placeholder="$t('settings.app.loader.images.urlPlaceholder')"
            class="min-w-0 flex-1"
            :aria-label="$t('settings.app.loader.images.useUrl')"
            @keyup.enter="applyUrlAt(i)"
          />
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="tabler:link"
            :aria-label="$t('settings.app.loader.images.useUrl')"
            @click="applyUrlAt(i)"
          >
            {{ $t('settings.app.loader.images.useUrl') }}
          </UButton>
        </div>
      </div>
    </div>

    <p class="mt-3 text-xs text-neutral-500 dark:text-neutral-500">
      {{ $t('settings.app.loader.images.help') }}
    </p>
  </div>
</template>

<style scoped></style>