<script lang="ts" setup>
import { locales as localeMeta } from '~/../i18n/i18n.options'

const { locale, setLocale, t } = useI18n()

const options = localeMeta.map((l) => ({
  label: l.name ?? l.code,
  code: l.code,
}))
</script>

<template>
  <UPopover mode="click">
    <UButton
      variant="ghost"
      color="neutral"
      size="sm"
      class="w-full justify-start px-2.5 text-(--ui-text-muted) hover:text-(--ui-text) cursor-pointer"
      :icon="'tabler:language'"
      :label="localeMeta.find((l) => l.code === locale)?.name ?? (locale as string)"
      :trailing-icon="'tabler:chevron-up'"
    />
    <template #content>
      <div class="min-w-40 p-1">
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
          class="justify-between cursor-pointer"
          :class="
            locale === opt.code
              ? 'bg-(--ui-primary) text-(--ui-primary-inverted)'
              : 'text-(--ui-text-muted) hover:text-(--ui-text)'
          "
          @click="setLocale(opt.code)"
        >
          <span>{{ opt.label }}</span>
          <Icon
            v-if="locale === opt.code"
            name="tabler:check"
            class="size-4"
          />
        </UButton>
      </div>
    </template>
  </UPopover>
</template>