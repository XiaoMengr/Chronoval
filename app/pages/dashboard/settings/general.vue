<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.generalSettings'),
})

const colorMode = useColorMode()

const { fields, state, submit, loading } = useSettingsForm('app')

const appFields = computed(() =>
  fields.value.filter(
    (f) =>
      !f.key.startsWith('appearance.') &&
      !f.key.startsWith('loader.'),
  ),
)

// 加载配置卡片：独立于基本设置，单独保存
// 取“已保存值”的依据应当是 API 返回的 field.value（database），
// 而不是硬编码默认值，否则当用户切回默认样式时会被误判为“未改动”而无法保存。
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
  state['loader.images'] = getLoaderSavedValue('loader.images') ?? [...LOADER_DEFAULT_IMAGES]
  state['loader.cardStyle'] = getLoaderSavedValue('loader.cardStyle') ?? LOADER_DEFAULT_CARD_STYLE
  state['loader.animation'] = getLoaderSavedValue('loader.animation') ?? LOADER_DEFAULT_ANIMATION
}

const handleLoaderImagesSubmit = async () => {
  try {
    await submit({
      'loader.images': state['loader.images'],
      'loader.cardStyle': state['loader.cardStyle'],
      'loader.animation': state['loader.animation'],
    })
  } catch {
    /* empty */
  }
}

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

const sameValue = (left: any, right: any) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

const getDefaultFieldValue = (field: (typeof fields.value)[number]) =>
  field.value ?? field.defaultValue ?? null

const isAppDirty = computed(() =>
  appFields.value.some((field) =>
    !sameValue(state[field.key], getDefaultFieldValue(field)),
  ),
)

const isAppearanceDirty = computed(() =>
  appearanceFields.value.some((field) =>
    !sameValue(state[field.key], getDefaultFieldValue(field)),
  ),
)

const resetAppSettings = () => {
  appFields.value.forEach((field) => {
    state[field.key] = getDefaultFieldValue(field)
  })
}

const resetAppearanceSettings = () => {
  appearanceFields.value.forEach((field) => {
    state[field.key] = getDefaultFieldValue(field)
  })
}

const handleAppSettingsSubmit = async () => {
  const appData = Object.fromEntries(
    appFields.value.map((f) => [f.key, state[f.key]]),
  )
  try {
    await submit(appData)
  } catch {
    /* empty */
  }
}

const handleAppearanceSettingsSubmit = async () => {
  const appearanceData = Object.fromEntries(
    appearanceFields.value.map((f) => [f.key, state[f.key]]),
  )
  try {
    await submit(appearanceData)
    if (state['appearance.theme']) {
      colorMode.preference = state['appearance.theme']
    }
  } catch {
    /* empty */
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.generalSettings')" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <h2 class="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {{ $t('title.generalSettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            {{ $t('settings.general.description') }}
          </p>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {{ $t('title.generalSettings') }}
            </h3>
          </header>

          <div
            v-if="loading && appFields.length === 0"
            class="space-y-4 px-5 py-5"
          >
            <USkeleton class="h-4 w-32" />
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-4 w-44" />
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-4 w-36" />
            <USkeleton class="h-10 w-full" />
          </div>

          <UForm
            v-else
            id="appSettingsForm"
            class="space-y-5 px-5 py-5"
            @submit="handleAppSettingsSubmit"
          >
            <template v-for="field in appFields" :key="field.key">
              <SettingField
                :field="field"
                :model-value="state[field.key]"
                @update:model-value="(val) => (state[field.key] = val)"
              />
            </template>
          </UForm>

          <footer class="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <div
              v-if="isAppDirty"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isAppDirty"
                @click="resetAppSettings"
              >
                {{ $t('common.actions.reset') }}
              </UButton>
            <UButton
              :loading="loading"
              type="submit"
              form="appSettingsForm"
              :disabled="!isAppDirty"
              icon="tabler:device-floppy"
            >
              {{ $t('common.actions.saveSettings') }}
            </UButton>
            </div>
          </footer>
        </section>

        <!-- 加载配置：独立卡片，可自定义进入画廊时加载动画的三张卡片图片 -->
        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
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
                :loading="loading"
                :disabled="!isLoaderDirty"
                icon="tabler:device-floppy"
                @click="handleLoaderImagesSubmit"
              >
                {{ $t('common.actions.saveSettings') }}
              </UButton>
            </div>
          </footer>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
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
              :loading="loading"
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
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
