<script lang="ts" setup>
import { locales as localeMeta } from '~/../i18n/i18n.options'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.interfaceSettings'),
})

const colorMode = useColorMode()

// 界面语言：locale 代码 → 简写（如 CN/HK/US/RU，离线可用的文本徽章），胶囊切换
const { locale, setLocale, t } = useI18n()
const toast = useToast()
const langCodeMap: Record<string, string> = {
  'zh-Hans': 'CN',
  'zh-Hant-TW': 'HK',
  'en': 'US',
  'ko': 'KO',
  'ru': 'RU',
  'vi': 'VN',
}
const langOptions = localeMeta.map((l) => ({
  code: l.code,
  short: langCodeMap[l.code] ?? l.code.slice(0, 2).toUpperCase(),
  name: l.name ?? l.code,
  sub: l.label && l.label !== l.name ? l.label : undefined,
}))

// 当前选中语言（供胶囊显示），切换时调用 setLocale 真正应用，并弹出系统通知
const selectedLang = ref(locale.value)
const selectedItem = computed(
  () => langOptions.find((o) => o.code === selectedLang.value),
)
watch(selectedLang, async (val) => {
  if (!val || val === locale.value) return
  await setLocale(val)
  toast.add({
    title: t('settings.interface.languageChanged'),
    color: 'success',
    icon: 'tabler:check',
    duration: 3000,
  })
})

const { fields, state, submit, loading } = useSettingsForm('app')

// 保存中的独立状态：区分“表单数据加载中”与“正在保存”，
// 避免初始加载时（loading=true）保存按钮也一直转圈。
const isSaving = ref(false)

const sameValue = (left: any, right: any) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

const getDefaultFieldValue = (field: (typeof fields.value)[number]) =>
  field.value ?? field.defaultValue ?? null

// 外观设置字段
const appearanceFields = computed(() =>
  fields.value.filter((f) => f.key.startsWith('appearance.')),
)

// 按 visibleIf 隐藏条件字段：例如圆角开关关闭时，不显示圆角数值输入
const visibleAppearanceFields = computed(() =>
  appearanceFields.value.filter((f) => {
    const cond = f.ui.visibleIf
    if (!cond) return true
    return sameValue(state[cond.fieldKey], cond.value)
  }),
)

const isAppearanceDirty = computed(() =>
  appearanceFields.value.some((field) =>
    !sameValue(state[field.key], getDefaultFieldValue(field)),
  ),
)

const resetAppearanceSettings = () => {
  // 重置 = 还原「出厂默认值」（defaultValue），而非回到上次保存值。
  // 例如卡片圆角开关恢复为关、半径恢复为默认数值、主题恢复为默认主题。
  appearanceFields.value.forEach((field) => {
    state[field.key] = field.defaultValue ?? null
  })
  // 同步当前主题到默认
  colorMode.preference = state['appearance.theme'] ?? 'dark'
}

const handleAppearanceSettingsSubmit = async () => {
  const appearanceData = Object.fromEntries(
    appearanceFields.value.map((f) => [f.key, state[f.key]]),
  )
  try {
    isSaving.value = true
    await submit(appearanceData)
    if (state['appearance.theme']) {
      colorMode.preference = state['appearance.theme']
    }
  } catch {
    /* empty */
  } finally {
    isSaving.value = false
  }
}

// 加载配置：独立卡片，可自定义进入画廊时加载动画的三张卡片图片
// 取“已保存值”的依据是 API 返回的 field.value（database），而非硬编码默认值。
const LOADER_DEFAULT_IMAGES = [
  '/loader/mountains_sm.jpg',
  '/loader/meadow_sm.jpg',
  '/loader/sea_sm.jpg',
]

const LOADER_DEFAULT_CARD_STYLE = 'liquid'
const LOADER_DEFAULT_ANIMATION = 'stack'

const getLoaderSavedValue = (key: string) => {
  const field = fields.value.find((f) => f.key === key)
  return field ? getDefaultFieldValue(field) : undefined
}

const isLoaderDirty = computed(() =>
  !sameValue(state['loader.images'], getLoaderSavedValue('loader.images')) ||
  !sameValue(state['loader.cardStyle'], getLoaderSavedValue('loader.cardStyle')) ||
  !sameValue(state['loader.animation'], getLoaderSavedValue('loader.animation')),
)

const resetLoaderImages = () => {
  // 重置 = 还原出厂默认加载配置（默认三张图、liquid 卡片、stack 动画）
  state['loader.images'] = [...LOADER_DEFAULT_IMAGES]
  state['loader.cardStyle'] = LOADER_DEFAULT_CARD_STYLE
  state['loader.animation'] = LOADER_DEFAULT_ANIMATION
}

const handleLoaderImagesSubmit = async () => {
  try {
    isSaving.value = true
    await submit({
      'loader.images': state['loader.images'],
      'loader.cardStyle': state['loader.cardStyle'],
      'loader.animation': state['loader.animation'],
    })
  } catch {
    /* empty */
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.interfaceSettings')" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <h2 class="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {{ $t('title.interfaceSettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            {{ $t('settings.interface.description') }}
          </p>
        </section>

        <!-- 外观设置 -->
        <section class="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {{ $t('title.appearanceSettings') }}
            </h3>
          </header>

          <div
            v-if="loading && appearanceFields.length === 0"
            class="space-y-4 px-5 py-5"
          >
            <USkeleton class="h-4 w-40" />
            <USkeleton class="h-10 w-full" />
          </div>

          <UForm
            v-else
            id="appearanceSettingsForm"
            class="space-y-5 px-5 py-5"
            @submit="handleAppearanceSettingsSubmit"
          >
            <SettingField
              v-for="field in visibleAppearanceFields"
              :key="field.key"
              :field="field"
              :model-value="state[field.key]"
              @update:model-value="(val) => (state[field.key] = val)"
            />
          </UForm>

          <footer class="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <div
              v-if="isAppearanceDirty"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isAppearanceDirty"
                @click="resetAppearanceSettings"
              >
                {{ $t('common.actions.reset') }}
              </UButton>
              <UButton
                :loading="isSaving"
                type="submit"
                form="appearanceSettingsForm"
                :disabled="!isAppearanceDirty"
                icon="tabler:device-floppy"
              >
                {{ $t('common.actions.saveSettings') }}
              </UButton>
            </div>
          </footer>
        </section>

        <!-- 界面语言 -->
        <section class="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
          <header class="flex items-center gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-500/10 text-primary-600 dark:bg-primary-400/10 dark:text-primary-400">
              <UIcon name="tabler:language" class="h-5 w-5" />
            </span>
            <div class="min-w-0">
              <h3 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                {{ $t('title.language') }}
              </h3>
              <p class="text-sm text-neutral-600 dark:text-neutral-400">
                {{ $t('settings.interface.description') }}
              </p>
            </div>
          </header>

          <div class="px-5 py-6">
            <div class="mx-auto flex w-full max-w-xl flex-wrap items-center justify-center gap-2">
              <button
                v-for="opt in langOptions"
                :key="opt.code"
                type="button"
                :title="opt.name"
                :aria-pressed="selectedLang === opt.code"
                class="inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors"
                :class="
                  selectedLang === opt.code
                    ? 'border-primary-500 bg-primary-500 text-white'
                    : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800'
                "
                @click="selectedLang = opt.code"
              >
                <span
                  class="grid h-6 min-w-7 shrink-0 place-items-center rounded-md px-1 text-[11px] font-bold"
                  :class="
                    selectedLang === opt.code
                      ? 'bg-white/20 text-white'
                      : 'bg-primary-500/15 text-primary-600 dark:bg-primary-400/15 dark:text-primary-400'
                  "
                >{{ opt.short }}</span>
                <span class="whitespace-nowrap">{{ opt.name }}</span>
              </button>
            </div>
          </div>
        </section>

        <!-- 加载配置 -->
        <section class="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {{ $t('title.loaderSettings') }}
            </h3>
            <p class="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {{ $t('settings.loader.description') }}
            </p>
          </header>

          <div
            v-if="loading && state['loader.images'] === undefined"
            class="space-y-4 px-5 py-5"
          >
            <USkeleton class="h-4 w-32" />
            <USkeleton class="h-10 w-full" />
          </div>

          <div v-else class="px-5 py-5">
            <SettingLoaderImagesSetting
              :model-value="state['loader.images']"
              :card-style="state['loader.cardStyle']"
              :animation="state['loader.animation']"
              @update:model-value="(val) => (state['loader.images'] = val)"
              @update:card-style="(val) => (state['loader.cardStyle'] = val)"
              @update:animation="(val) => (state['loader.animation'] = val)"
            />
          </div>

          <footer class="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <div
              v-if="isLoaderDirty"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isLoaderDirty"
                @click="resetLoaderImages"
              >
                {{ $t('common.actions.reset') }}
              </UButton>
              <UButton
                :loading="isSaving"
                :disabled="!isLoaderDirty"
                icon="tabler:device-floppy"
                @click="handleLoaderImagesSubmit"
              >
                {{ $t('common.actions.saveSettings') }}
              </UButton>
            </div>
          </footer>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>