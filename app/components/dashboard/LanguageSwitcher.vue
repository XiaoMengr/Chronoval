<script lang="ts" setup>
import { locales as localeMeta } from '~/../i18n/i18n.options'

const { locale, setLocale, t } = useI18n()

// locale 代码 → 国旗（emoji，离线可用，无需网络）
const flagMap: Record<string, string> = {
  'zh-Hans': '🇨🇳',
  'zh-Hant-TW': '🇹🇼',
  'zh-Hant-HK': '🇭🇰',
  'en': '🇺🇸',
  'ja': '🇯🇵',
  'ru': '🇷🇺',
}

const options = localeMeta.map((l) => ({
  label: l.name ?? l.code,
  code: l.code,
  flag: flagMap[l.code] ?? '🌐',
}))

const currentFlag = computed(
  () => options.find((o) => o.code === locale)?.flag ?? '🌐',
)
const currentLabel = computed(
  () => options.find((o) => o.code === locale)?.label ?? (locale as string),
)
</script>

<template>
  <UPopover mode="click">
    <UButton
      variant="subtle"
      color="neutral"
      size="sm"
      class="w-full cursor-pointer justify-start gap-2 px-2.5 text-(--ui-text-muted) hover:text-(--ui-text)"
    >
      <span class="shrink-0 text-base leading-none">{{ currentFlag }}</span>
      <span class="truncate">{{ currentLabel }}</span>
      <Icon name="tabler:chevron-down" class="ml-auto size-4 shrink-0" />
    </UButton>
    <template #content>
      <div class="min-w-44 p-1">
        <p class="px-2 py-1.5 text-xs font-medium text-(--ui-text-dimmed)">
          {{ t('title.language') }}
        </p>
        <UButton
          v-for="opt in options"
          :key="opt.code"
          size="sm"
          variant="ghost"
          color="neutral"
          block
          class="cursor-pointer justify-between"
          :class="
            locale === opt.code
              ? 'bg-(--ui-primary) text-(--ui-primary-inverted)'
              : 'text-(--ui-text-muted) hover:text-(--ui-text)'
          "
          @click="setLocale(opt.code)"
        >
          <span class="flex items-center gap-2">
            <span class="shrink-0 text-base leading-none">{{ opt.flag }}</span>
            <span>{{ opt.label }}</span>
          </span>
          <Icon v-if="locale === opt.code" name="tabler:check" class="size-4" />
        </UButton>
      </div>
    </template>
  </UPopover>
</template>