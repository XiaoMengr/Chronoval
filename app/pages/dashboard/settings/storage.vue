<script lang="ts" setup>
import { UChip, UButton } from '#components'
import type { TableColumn } from '@nuxt/ui'
import {
  s3StorageConfigSchema,
  localStorageConfigSchema,
  openListStorageConfigSchema,
  type StorageConfig,
} from '~~/shared/types/storage'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.storageSettings'),
})

const toast = useToast()

const { data: currentStorageProvider, refresh: refreshCurrentStorageProvider } =
  await useFetch<{
    namespace: string
    key: string
    value: SettingValue
  }>('/api/system/settings/storage/provider')

const {
  data: availableStorage,
  refresh: refreshAvailableStorage,
  status: availableStorageStatus,
} =
  await useFetch<SettingStorageProvider[]>(
    '/api/system/settings/storage-config',
  )

const PROVIDER_ICON = {
  s3: 'tabler:brand-aws',
  local: 'tabler:database',
  openlist: 'tabler:cloud',
}

const availableStorageColumns = computed<TableColumn<SettingStorageProvider>[]>(
  () => [
  {
    accessorKey: 'status',
    header: '',
    meta: {
      class: {
        th: 'w-10',
      },
    },
    cell: (cell) => {
      const isActive =
        currentStorageProvider.value?.value === cell.row.original.id
      return h(UChip, {
        size: 'md',
        inset: true,
        standalone: true,
        color: isActive ? 'success' : undefined,
        ui: {
          base: !isActive ? 'bg-neutral-200 dark:bg-neutral-700' : '',
        },
      })
    },
  },
  { accessorKey: 'name', header: $t('settings.storage.table.columns.name') },
  { accessorKey: 'provider', header: $t('settings.storage.table.columns.type') },
  {
    accessorKey: 'actions',
    header: $t('settings.storage.table.columns.actions'),
    cell: (cell) => {
      return h('div', { class: 'flex items-center gap-2' }, [
        h(
          UButton,
          {
            size: 'sm',
            variant: 'soft',
            icon: 'tabler:info-circle',
            onClick: () => {
              storageInfo.value = cell.row.original
              storageInfoOpen.value = true
            },
          },
          { default: () => $t('settings.storage.actions.info') },
        ),
        h(
          UButton,
          {
            size: 'sm',
            variant: 'soft',
            color: 'error',
            icon: 'tabler:trash',
            disabled:
              currentStorageProvider.value?.value === cell.row.original.id,
            onClick: () => onStorageDelete(cell.row.original.id),
          },
          { default: () => $t('common.actions.delete') },
        ),
      ])
    },
  },
  ],
)

const storageSettingsState = reactive<{
  storageConfigId?: number
}>({
  storageConfigId: currentStorageProvider.value
    ? (currentStorageProvider.value.value as number)
    : undefined,
})

const isStorageDefaultDirty = computed(() => {
  return storageSettingsState.storageConfigId !== currentStorageProvider.value?.value
})

const resetStorageDefault = () => {
  storageSettingsState.storageConfigId = currentStorageProvider.value
    ? (currentStorageProvider.value.value as number)
    : undefined
}

const handleStorageSettingsSubmit = async (close?: () => void) => {
  try {
    await $fetch('/api/system/settings/storage/provider', {
      method: 'PUT',
      body: {
        value: storageSettingsState.storageConfigId,
      },
    })
    refreshCurrentStorageProvider()
    close?.()
    toast.add({
      title: $t('settings.storage.messages.saved'),
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: $t('settings.storage.messages.saveError'),
      description: (error as Error).message,
      color: 'error',
    })
  }
}

const providerOptions = computed(() => [
  { label: $t('settings.storage.providers.s3'), value: 's3', icon: PROVIDER_ICON.s3 },
  { label: $t('settings.storage.providers.local'), value: 'local', icon: PROVIDER_ICON.local },
  { label: $t('settings.storage.providers.openlist'), value: 'openlist', icon: PROVIDER_ICON.openlist },
])

const storageConfigState = reactive<{
  name: string
  provider: string
  config: Partial<StorageConfig>
}>({
  name: '',
  provider: 's3',
  config: {
    provider: 's3',
    region: 'auto',
    prefix: '/photos',
  } as any,
})

// 根据 provider 值动态选择对应的 schema
const currentStorageSchema = computed(() => {
  const provider = storageConfigState.provider
  switch (provider) {
    case 'local':
      return localStorageConfigSchema
    case 'openlist':
      return openListStorageConfigSchema
    case 's3':
    default:
      return s3StorageConfigSchema
  }
})

// 获取存储配置的默认值
const getStorageConfigDefaults = (provider: string): Partial<StorageConfig> => {
  switch (provider) {
    case 'local':
      return {
        provider: 'local',
        basePath: '/app/photos',
        baseUrl: '/storage',
      } as any
    case 'openlist':
      return {
        provider: 'openlist',
        uploadEndpoint: '/api/fs/put',
        deleteEndpoint: '/api/fs/remove',
        metaEndpoint: '/api/fs/get',
        pathField: 'path',
      } as any
    case 's3':
    default:
      return {
        provider: 's3',
        region: 'auto',
        prefix: '/photos',
      } as any
  }
}

// 动态生成 fields-config，包含翻译键
const storageFieldsConfig = computed<Record<string, any>>(() => {
  const provider = storageConfigState.provider
  const baseKey = `settings.storage.${provider}`

  switch (provider) {
    case 'local':
      return {
        provider: { hidden: true },
        basePath: {
          label: $t(`${baseKey}.basePath.label`),
          description: $t(`${baseKey}.basePath.description`),
        },
        baseUrl: {
          label: $t(`${baseKey}.baseUrl.label`),
          description: $t(`${baseKey}.baseUrl.description`),
        },
        prefix: {
          label: $t(`${baseKey}.prefix.label`),
          description: $t(`${baseKey}.prefix.description`),
        },
      }
    case 'openlist':
      return {
        provider: { hidden: true },
        baseUrl: {
          label: $t(`${baseKey}.baseUrl.label`),
          description: $t(`${baseKey}.baseUrl.description`),
        },
        rootPath: {
          label: $t(`${baseKey}.rootPath.label`),
          description: $t(`${baseKey}.rootPath.description`),
        },
        token: {
          label: $t(`${baseKey}.token.label`),
          description: $t(`${baseKey}.token.description`),
        },
        uploadEndpoint: {
          label: $t(`${baseKey}.uploadEndpoint.label`),
          description: $t(`${baseKey}.uploadEndpoint.description`),
        },
        downloadEndpoint: {
          label: $t(`${baseKey}.downloadEndpoint.label`),
          description: $t(`${baseKey}.downloadEndpoint.description`),
        },
        listEndpoint: {
          label: $t(`${baseKey}.listEndpoint.label`),
          description: $t(`${baseKey}.listEndpoint.description`),
        },
        deleteEndpoint: {
          label: $t(`${baseKey}.deleteEndpoint.label`),
          description: $t(`${baseKey}.deleteEndpoint.description`),
        },
        metaEndpoint: {
          label: $t(`${baseKey}.metaEndpoint.label`),
          description: $t(`${baseKey}.metaEndpoint.description`),
        },
        pathField: {
          label: $t(`${baseKey}.pathField.label`),
          description: $t(`${baseKey}.pathField.description`),
        },
        cdnUrl: {
          label: $t(`${baseKey}.cdnUrl.label`),
          description: $t(`${baseKey}.cdnUrl.description`),
        },
      }
    case 's3':
    default:
      return {
        provider: { hidden: true },
        bucket: {
          label: $t(`${baseKey}.bucket.label`),
          description: $t(`${baseKey}.bucket.description`),
        },
        region: {
          label: $t(`${baseKey}.region.label`),
          description: $t(`${baseKey}.region.description`),
        },
        endpoint: {
          label: $t(`${baseKey}.endpoint.label`),
          description: $t(`${baseKey}.endpoint.description`),
        },
        prefix: {
          label: $t(`${baseKey}.prefix.label`),
          description: $t(`${baseKey}.prefix.description`),
        },
        cdnUrl: {
          label: $t(`${baseKey}.cdnUrl.label`),
          description: $t(`${baseKey}.cdnUrl.description`),
        },
        accessKeyId: {
          label: $t(`${baseKey}.accessKeyId.label`),
          description: $t(`${baseKey}.accessKeyId.description`),
        },
        secretAccessKey: {
          label: $t(`${baseKey}.secretAccessKey.label`),
          description: $t(`${baseKey}.secretAccessKey.description`),
        },
        forcePathStyle: {
          label: $t(`${baseKey}.forcePathStyle.label`),
          description: $t(`${baseKey}.forcePathStyle.description`),
        },
        maxKeys: {
          label: $t(`${baseKey}.maxKeys.label`),
          description: $t(`${baseKey}.maxKeys.description`),
        },
      }
  }
})

const onStorageConfigSubmit = async (
  event: { data: Partial<StorageConfig> },
  close?: () => void,
) => {
  try {
    const payload = {
      name: storageConfigState.name,
      provider: storageConfigState.provider,
      config: event.data,
    }

    await $fetch('/api/system/settings/storage-config', {
      method: 'POST',
      body: payload,
    })
    refreshAvailableStorage()
    toast.add({
      title: $t('settings.storage.messages.created'),
      color: 'success',
    })
    // 重置表单
    storageConfigState.name = ''
    storageConfigState.provider = 's3'
    storageConfigState.config = getStorageConfigDefaults('s3')
    close?.()
  } catch (error) {
    toast.add({
      title: $t('settings.storage.messages.createError'),
      description: (error as Error).message,
      color: 'error',
    })
  }
}

const onStorageDelete = async (storageId: number) => {
  try {
    await $fetch(`/api/system/settings/storage-config/${storageId}`, {
      method: 'DELETE',
    })
    refreshAvailableStorage()
    toast.add({
      title: $t('settings.storage.messages.deleted'),
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: $t('settings.storage.messages.deleteError'),
      description: (error as Error).message,
      color: 'error',
    })
  }
}

// ===== 本地扫描库（独立存储方式） =====
interface ScanLibraryItem {
  id: number
  name: string
  rootPath: string
  provider: 'local'
  enabled: boolean
  asAlbum: boolean
  watchIntervalMs: number
  lastScanAt: string | null
  lastScanResult: string | null
  photoCount: number
  createdAt?: string | null
  updatedAt?: string | null
}

const {
  data: scanLibData,
  refresh: refreshScanLibs,
} = await useFetch<{ libraries: ScanLibraryItem[] }>('/api/scan-library')

const scanLibs = computed(() => scanLibData.value?.libraries ?? [])

const scanLibraryFormState = reactive<{
  editId: number | null
  name: string
  rootPath: string
  enabled: boolean
  /** 作为「相簿」在相册页展示（同时从首页全局画廊隐藏） */
  asAlbum: boolean
  watchIntervalMs: number
}>({
  editId: null,
  name: '',
  rootPath: '',
  enabled: true,
  asAlbum: false,
  watchIntervalMs: 60000,
})

const resetScanLibraryForm = () => {
  scanLibraryFormState.editId = null
  scanLibraryFormState.name = ''
  scanLibraryFormState.rootPath = ''
  scanLibraryFormState.enabled = true
  scanLibraryFormState.asAlbum = false
  scanLibraryFormState.watchIntervalMs = 60000
}

const openAddScanLibrary = () => resetScanLibraryForm()

// 编辑/查看复用的单一滑动抽屉（避免多个 Slideover 叠加导致的遮罩层互相遮挡/点击失效）
const scanLibSlideover = reactive<{
  open: boolean
  mode: 'edit' | 'info'
  lib: ScanLibraryItem | null
}>({
  open: false,
  mode: 'edit',
  lib: null,
})

const openScanLibraryEdit = (lib: ScanLibraryItem) => {
  scanLibraryFormState.editId = lib.id
  scanLibraryFormState.name = lib.name
  scanLibraryFormState.rootPath = lib.rootPath
  scanLibraryFormState.enabled = lib.enabled
  scanLibraryFormState.asAlbum = lib.asAlbum
  scanLibraryFormState.watchIntervalMs = lib.watchIntervalMs
  Object.assign(scanLibSlideover, { open: true, mode: 'edit', lib })
}

const scanLibraryPayload = () => ({
  name: scanLibraryFormState.name || undefined,
  rootPath: scanLibraryFormState.rootPath,
  enabled: scanLibraryFormState.enabled,
  asAlbum: scanLibraryFormState.asAlbum,
  watchIntervalMs: scanLibraryFormState.watchIntervalMs,
})

const onScanLibrarySubmit = async (close?: () => void) => {
  const key = `settings.storage.scanLibrary.messages.`
  try {
    if (scanLibraryFormState.editId != null) {
      await $fetch(`/api/scan-library/${scanLibraryFormState.editId}`, {
        method: 'PUT',
        body: scanLibraryPayload(),
      })
      toast.add({ title: $t(`${key}updated`), color: 'success' })
    } else {
      await $fetch('/api/scan-library', {
        method: 'POST',
        body: scanLibraryPayload(),
      })
      toast.add({ title: $t(`${key}created`), color: 'success' })
    }
    await refreshScanLibs()
    close?.()
  } catch (error) {
    toast.add({
      title: $t(`${key}saveError`),
      description: (error as Error).message,
      color: 'error',
    })
  }
}

// 扫描库启停正在切换中的 id（用于开关 loading / 防重复点击）
const scanTogglingId = ref<number | null>(null)

const onScanLibraryToggle = async (lib: ScanLibraryItem) => {
  if (scanTogglingId.value !== null) return
  scanTogglingId.value = lib.id
  try {
    await $fetch(`/api/scan-library/${lib.id}`, {
      method: 'PUT',
      body: { enabled: lib.enabled },
    })
    // 成功后一律以服务端结果为准，重新拉取，保证状态同步
    await refreshScanLibs()
    toast.add({
      title: $t('settings.storage.scanLibrary.messages.saved'),
      color: 'success',
    })
  } catch (error) {
    // 失败回滚到服务端真实状态
    await refreshScanLibs()
    toast.add({
      title: $t('settings.storage.scanLibrary.messages.saveError'),
      description: (error as Error).message,
      color: 'error',
    })
  } finally {
    scanTogglingId.value = null
  }
}

const scanLibRunning = ref<number | null>(null)
const onScanLibraryScan = async (lib: ScanLibraryItem) => {
  scanLibRunning.value = lib.id
  try {
    const res = await $fetch<{ scanResult: { indexed: number; updated: number; failed: number } | null }>(
      `/api/scan-library/${lib.id}/scan`,
      { method: 'POST' },
    )
    const r = res.scanResult
    const desc = r
      ? `${$t('settings.storage.scanLibrary.result.new')} ${r.indexed} · ${$t('settings.storage.scanLibrary.result.updated')} ${r.updated} · ${$t('settings.storage.scanLibrary.result.failed')} ${r.failed}`
      : undefined
    toast.add({
      title: $t('settings.storage.scanLibrary.messages.scanned'),
      description: desc,
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: $t('settings.storage.scanLibrary.messages.scanError'),
      description: (error as Error).message,
      color: 'error',
    })
  } finally {
    scanLibRunning.value = null
    await refreshScanLibs()
  }
}

const onScanLibraryDelete = async (lib: ScanLibraryItem) => {
  try {
    await $fetch(`/api/scan-library/${lib.id}`, { method: 'DELETE' })
    await refreshScanLibs()
    toast.add({
      title: $t('settings.storage.scanLibrary.messages.deleted'),
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: $t('settings.storage.scanLibrary.messages.deleteError'),
      description: (error as Error).message,
      color: 'error',
    })
  }
}

// 已挂载标记：用于时间格式化的 SSR 水合一致性
const isHydrated = ref(false)
onMounted(() => {
  isHydrated.value = true
})

// 格式化时间：输出浏览器本地时区文案（避免服务端 UTC 与客户端东八区不一致导致的水合 mismatch）
const fmtScanTime = (iso: string | null) => {
  if (!iso) return $t('settings.storage.scanLibrary.table.notScanned')
  // 服务端/水合首帧渲染空占位，挂载后再补真实本地时间
  if (!isHydrated.value) return ''
  return new Date(iso).toLocaleString()
}

// 把监控间隔毫秒格式化成人类可读文本（60 秒 / 1 分钟 等）
const intervalHumanText = computed(() => {
  const ms = scanLibraryFormState.watchIntervalMs || 0
  const s = Math.round(ms / 1000)
  if (s < 60) return $t('settings.storage.scanLibrary.form.intervalSeconds', { value: s })
  if (s % 60 === 0) return $t('settings.storage.scanLibrary.form.intervalMinutes', { value: s / 60 })
  return $t('settings.storage.scanLibrary.form.intervalMixed', {
    minutes: Math.floor(s / 60),
    seconds: s % 60,
  })
})

// 查看扫描库详细配置信息
const openScanLibraryInfo = (lib: ScanLibraryItem) => {
  Object.assign(scanLibSlideover, { open: true, mode: 'info', lib })
}

/** 详情抽屉当前展示的扫描库（mode==='info' 时为指向的 lib） */
const scanLibInfo = computed(() =>
  scanLibSlideover.mode === 'info' ? scanLibSlideover.lib : null,
)

// 查看上传存储方案（本地/S3/Openlist）配置信息
const storageInfo = ref<SettingStorageProvider | null>(null)
const storageInfoOpen = ref(false)
const storageConfigLabelKeyMap: Record<string, string> = {
  basePath: 'settings.storage.info.config.basePath',
  baseUrl: 'settings.storage.info.config.baseUrl',
  prefix: 'settings.storage.info.config.prefix',
  bucket: 'settings.storage.info.config.bucket',
  region: 'settings.storage.info.config.region',
  endpoint: 'settings.storage.info.config.endpoint',
  cdnUrl: 'settings.storage.info.config.cdnUrl',
  rootPath: 'settings.storage.info.config.rootPath',
  token: 'settings.storage.info.config.token',
}
const storageInfoConfigEntries = computed(() => {
  const cfg = storageInfo.value?.config as Record<string, any> | undefined
  if (!cfg) return []
  return Object.entries(cfg)
    .filter(([key]) => key !== 'provider')
    .map(([key, value]) => ({
    key,
    label: $t(
      storageConfigLabelKeyMap[key] || `settings.storage.info.config.${key}`,
    ),
    value:
      value && typeof value === 'object'
        ? JSON.stringify(value)
        : String(value ?? ''),
  }))
})
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.storageSettings')" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <h2 class="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {{ $t('title.storageSettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            {{ $t('settings.storage.sectionDescription') }}
          </p>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {{ $t('settings.storage.sections.currentDefault') }}
            </h3>
          </header>

          <div
            v-if="availableStorageStatus !== 'success' && !availableStorage"
            class="space-y-4 px-5 py-5"
          >
            <USkeleton class="h-4 w-32" />
            <USkeleton class="h-10 w-72" />
          </div>

          <div
            v-else
            class="space-y-4 px-5 py-5"
          >
            <UFormField
              name="storageConfigId"
              :label="$t('settings.storage.form.schemeLabel')"
              required
              :ui="{
                container: 'w-full sm:max-w-sm *:w-full',
              }"
            >
              <USelectMenu
                v-model="storageSettingsState.storageConfigId"
                :icon="
                  PROVIDER_ICON[
                    availableStorage?.find(
                      (item) =>
                        item.id === storageSettingsState.storageConfigId,
                    )?.provider || 'local'
                  ] || 'tabler:database'
                "
                :items="
                  availableStorage?.map((item) => ({
                    icon: PROVIDER_ICON[item.provider] || 'tabler:database',
                    label: item.name,
                    value: item.id,
                  }))
                "
                label-key="label"
                value-key="value"
                :placeholder="$t('settings.storage.form.schemePlaceholder')"
              />
            </UFormField>
          </div>

          <footer class="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <div
              v-if="isStorageDefaultDirty"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isStorageDefaultDirty"
                @click="resetStorageDefault"
              >
                {{ $t('common.actions.reset') }}
              </UButton>
              <UModal
                :title="$t('settings.storage.changeModal.title')"
                :ui="{ footer: 'justify-end' }"
              >
                <UButton
                  :disabled="!isStorageDefaultDirty"
                  icon="tabler:device-floppy"
                >
                  {{ $t('common.actions.saveSettings') }}
                </UButton>

                <template #body>
                  <UAlert
                    color="neutral"
                    variant="subtle"
                    :title="$t('settings.storage.changeModal.alertTitle')"
                    :description="$t('settings.storage.changeModal.alertDescription')"
                    icon="tabler:arrows-exchange"
                  />
                </template>

                <template #footer="{ close }">
                  <UButton
                    :label="$t('common.actions.cancel')"
                    color="neutral"
                    variant="outline"
                    @click="close"
                  />
                  <UButton
                    :label="$t('common.actions.continue')"
                    variant="soft"
                    icon="tabler:arrows-exchange"
                    type="submit"
                    form="storageSettingsForm"
                    @click="handleStorageSettingsSubmit(close)"
                  />
                </template>
              </UModal>
            </div>
          </footer>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="flex w-full items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {{ $t('settings.storage.sections.management') }}
            </h3>
            <div>
              <USlideover
                :title="$t('settings.storage.slideover.title')"
                :ui="{ footer: 'justify-end' }"
              >
                <UButton
                  size="sm"
                  variant="soft"
                  icon="tabler:plus"
                >
                  {{ $t('settings.storage.actions.add') }}
                </UButton>

                <template #body="{ close }">
                  <div class="space-y-4">
                    <!-- Provider 选择 -->
                    <UFormField
                      :label="$t('settings.storage.form.typeLabel')"
                      class="w-full"
                      required
                      :ui="{
                        container: 'sm:max-w-full',
                      }"
                    >
                      <USelectMenu
                        v-model="storageConfigState.provider"
                        :icon="
                          PROVIDER_ICON[
                            storageConfigState.provider as keyof typeof PROVIDER_ICON
                          ] || 'tabler:database'
                        "
                        :items="providerOptions"
                        label-key="label"
                        value-key="value"
                        :placeholder="$t('settings.storage.form.typePlaceholder')"
                        @update:model-value="
                          (val: string) => {
                            storageConfigState.provider = val
                            storageConfigState.config =
                              getStorageConfigDefaults(val)
                          }
                        "
                      />
                    </UFormField>

                    <UFormField
                      :label="$t('settings.storage.form.nameLabel')"
                      required
                      :ui="{
                        container: 'sm:max-w-full',
                      }"
                    >
                      <UInput v-model="storageConfigState.name" />
                    </UFormField>

                    <USeparator />

                    <AutoForm
                      id="createStorageForm"
                      :schema="currentStorageSchema"
                      :state="storageConfigState.config"
                      :fields-config="storageFieldsConfig"
                      @submit="onStorageConfigSubmit($event, close)"
                    />
                  </div>
                </template>

                <template #footer="{ close }">
                  <UButton
                    :label="$t('common.actions.cancel')"
                    color="neutral"
                    variant="outline"
                    @click="close"
                  />
                  <UButton
                    :label="$t('settings.storage.actions.create')"
                    variant="soft"
                    icon="tabler:check"
                    type="submit"
                    form="createStorageForm"
                  />
                </template>
              </USlideover>
            </div>
          </header>

          <div
            v-if="availableStorageStatus !== 'success' && !availableStorage"
            class="space-y-3 px-5 py-5"
          >
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-full" />
          </div>

          <div
            v-else
            class="px-0 py-0"
          >
            <UTable
              :columns="availableStorageColumns"
              :data="availableStorage"
            />
          </div>

          <USlideover
            v-model:open="storageInfoOpen"
            :title="$t('settings.storage.info.title')"
            :ui="{ footer: 'justify-end' }"
          >
            <template #body>
              <div
                v-if="storageInfo"
                class="space-y-4"
              >
                <div
                  class="grid gap-px rounded-md bg-neutral-100 dark:bg-neutral-800 overflow-hidden"
                >
                  <div class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.info.name') }}
                    </span>
                    <span class="max-w-[60%] text-right text-sm font-medium text-neutral-900 dark:text-neutral-100 break-words">
                      {{ storageInfo.name }}
                    </span>
                  </div>
                  <div class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.info.type') }}
                    </span>
                    <span class="text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      <UBadge
                        variant="subtle"
                        :icon="PROVIDER_ICON[storageInfo.provider as keyof typeof PROVIDER_ICON] || 'tabler:database'"
                      >
                        {{ storageInfo.provider }}
                      </UBadge>
                    </span>
                  </div>
                  <div
                    v-for="entry in storageInfoConfigEntries"
                    :key="entry.key"
                    class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3"
                  >
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ entry.label }}
                    </span>
                    <span class="max-w-[60%] text-right text-sm font-medium text-neutral-900 dark:text-neutral-100 break-all">
                      {{ entry.value }}
                    </span>
                  </div>
                  <div v-if="storageInfo.createdAt" class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.info.createdAt') }}
                    </span>
                    <span class="text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {{ fmtScanTime(storageInfo.createdAt) }}
                    </span>
                  </div>
                  <div v-if="storageInfo.updatedAt" class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.info.updatedAt') }}
                    </span>
                    <span class="text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {{ fmtScanTime(storageInfo.updatedAt) }}
                    </span>
                  </div>
                </div>
              </div>
            </template>
            <template #footer="{ close }">
              <UButton
                :label="$t('common.actions.close')"
                color="neutral"
                variant="outline"
                @click="close"
              />
            </template>
          </USlideover>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="flex w-full items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <div>
              <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {{ $t('settings.storage.scanLibrary.sectionTitle') }}
              </h3>
              <p class="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                {{ $t('settings.storage.scanLibrary.sectionDescription') }}
              </p>
            </div>
            <USlideover
              :title="$t('settings.storage.scanLibrary.slideover.title')"
              :ui="{ footer: 'justify-end' }"
              @open="openAddScanLibrary"
            >
              <UButton size="sm" variant="soft" icon="tabler:folder-plus">
                {{ $t('settings.storage.scanLibrary.actions.add') }}
              </UButton>

              <template #body>
                <div class="space-y-4">
                  <UFormField :ui="{ container: 'sm:max-w-full' }">
                    <div class="flex w-full items-center justify-between gap-4 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 px-3 py-2.5">
                      <div class="flex flex-col gap-0.5">
                        <span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          {{ $t('settings.storage.scanLibrary.form.enabledLabel') }}
                        </span>
                        <span
                          class="text-xs"
                          :class="scanLibraryFormState.enabled
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-neutral-400 dark:text-neutral-500'"
                        >
                          {{ scanLibraryFormState.enabled
                            ? $t('settings.storage.scanLibrary.form.enabledStateOn')
                            : $t('settings.storage.scanLibrary.form.enabledStateOff') }}
                        </span>
                      </div>
                      <USwitch v-model="scanLibraryFormState.enabled" color="success" />
                    </div>
                  </UFormField>
                  <UFormField
                    :label="$t('settings.storage.scanLibrary.form.nameLabel')"
                    :ui="{ container: 'sm:max-w-full' }"
                  >
                    <UInput
                      v-model="scanLibraryFormState.name"
                      :placeholder="$t('settings.storage.scanLibrary.form.namePlaceholder')"
                    />
                  </UFormField>
                  <UFormField
                    :label="$t('settings.storage.scanLibrary.form.pathLabel')"
                    required
                    :ui="{ container: 'sm:max-w-full' }"
                  >
                    <UInput
                      v-model="scanLibraryFormState.rootPath"
                      :placeholder="$t('settings.storage.scanLibrary.form.pathPlaceholder')"
                    />
                  </UFormField>
                  <UFormField
                        :label="$t('settings.storage.scanLibrary.form.intervalLabel')"
                        :ui="{ container: 'sm:max-w-full' }"
                      >
                        <div class="flex items-center gap-2 w-full">
                          <UInput
                            v-model.number="scanLibraryFormState.watchIntervalMs"
                            type="number"
                            :min="5000"
                            class="w-full"
                          />
                          <span class="shrink-0 text-sm text-neutral-400">
                            {{ $t('settings.storage.scanLibrary.form.intervalMsSuffix') }}
                          </span>
                        </div>
                        <p class="mt-1.5 flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                          <UIcon name="tabler:clock" class="size-3.5 shrink-0" />
                          {{ $t('settings.storage.scanLibrary.form.intervalHint') }}：{{ intervalHumanText }}
                        </p>
                      </UFormField>
                </div>
              </template>

              <template #footer="{ close }">
                <UButton
                  :label="$t('common.actions.cancel')"
                  color="neutral"
                  variant="outline"
                  @click="close"
                />
                <UButton
                  :label="$t('settings.storage.scanLibrary.actions.save')"
                  variant="soft"
                  icon="tabler:check"
                  @click="onScanLibrarySubmit(close)"
                />
              </template>
            </USlideover>
          </header>

          <div v-if="!scanLibs.length" class="px-5 py-6 text-sm text-neutral-500 dark:text-neutral-400">
            {{ $t('settings.storage.scanLibrary.empty') }}
          </div>

          <div v-else class="divide-y divide-neutral-100 dark:divide-neutral-800">
            <div
              v-for="lib in scanLibs"
              :key="lib.id"
              class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <ScanStatusDot :enabled="lib.enabled" :raw="lib.lastScanResult" />
                  <USwitch
                    v-model="lib.enabled"
                    size="sm"
                    :loading="scanTogglingId === lib.id"
                    :disabled="scanTogglingId !== null"
                    @change="onScanLibraryToggle(lib)"
                  />
                  <span class="font-medium text-neutral-900 dark:text-neutral-100">
                    {{ lib.name }}
                  </span>
                </div>
                <p class="truncate text-sm text-neutral-500 dark:text-neutral-400">
                  {{ lib.rootPath }}
                </p>
                <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400 dark:text-neutral-500">
                  <span>
                    {{ $t('settings.storage.scanLibrary.table.photoCount') }}
                    <span class="font-medium text-neutral-700 dark:text-neutral-300">{{ lib.photoCount }}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="tabler:clock" class="size-3.5" />
                    {{ fmtScanTime(lib.lastScanAt) }}
                  </span>
                  <template v-if="lib.lastScanResult">
                    <span aria-hidden="true">·</span>
                    <ScanResultBadges :raw="lib.lastScanResult" />
                  </template>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <UTooltip :text="$t('settings.storage.scanLibrary.messages.scanned')">
                  <UButton
                    size="sm"
                    variant="soft"
                    icon="tabler:player-play"
                    :loading="scanLibRunning === lib.id"
                    :disabled="scanLibRunning !== null"
                    @click="onScanLibraryScan(lib)"
                  />
                </UTooltip>

                <UButton
                  size="sm"
                  variant="soft"
                  icon="tabler:pencil"
                  @click="openScanLibraryEdit(lib)"
                />
                <UButton
                  size="sm"
                  variant="soft"
                  icon="tabler:info-circle"
                  @click="openScanLibraryInfo(lib)"
                />

                <UButton
                  size="sm"
                  variant="soft"
                  color="error"
                  icon="tabler:trash"
                  @click="onScanLibraryDelete(lib)"
                />
              </div>
            </div>
          </div>

          <USlideover
            v-model:open="scanLibSlideover.open"
            :title="scanLibSlideover.mode === 'edit'
              ? $t('settings.storage.scanLibrary.slideover.editTitle')
              : $t('settings.storage.scanLibrary.slideover.infoTitle')"
            :ui="{ footer: 'justify-end' }"
          >
            <template #body>
              <div
                v-if="scanLibSlideover.mode === 'edit'"
                class="space-y-4"
              >
                <UFormField
                  :label="$t('settings.storage.scanLibrary.form.nameLabel')"
                  :ui="{ container: 'sm:max-w-full' }"
                >
                  <UInput v-model="scanLibraryFormState.name" />
                </UFormField>
                <UFormField
                  :label="$t('settings.storage.scanLibrary.form.pathLabel')"
                  required
                  :ui="{ container: 'sm:max-w-full' }"
                >
                  <UInput v-model="scanLibraryFormState.rootPath" />
                </UFormField>
                <UFormField
                  :label="$t('settings.storage.scanLibrary.form.intervalLabel')"
                  :ui="{ container: 'sm:max-w-full' }"
                >
                  <div class="flex items-center gap-2 w-full">
                    <UInput
                      v-model.number="scanLibraryFormState.watchIntervalMs"
                      type="number"
                      :min="5000"
                      class="w-full"
                    />
                    <span class="shrink-0 text-sm text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.form.intervalMsSuffix') }}
                    </span>
                  </div>
                  <p class="mt-1.5 flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                    <UIcon name="tabler:clock" class="size-3.5 shrink-0" />
                    {{ $t('settings.storage.scanLibrary.form.intervalHint') }}：{{ intervalHumanText }}
                  </p>
                </UFormField>
                <UFormField
                  :ui="{ container: 'sm:max-w-full' }"
                >
                  <div class="flex w-full items-center justify-between gap-4 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 px-3 py-2.5">
                    <div class="flex flex-col gap-0.5">
                      <span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {{ $t('settings.storage.scanLibrary.form.enabledLabel') }}
                      </span>
                      <span
                        class="text-xs"
                        :class="scanLibraryFormState.enabled
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-neutral-400 dark:text-neutral-500'"
                      >
                        {{ scanLibraryFormState.enabled
                          ? $t('settings.storage.scanLibrary.form.enabledStateOn')
                          : $t('settings.storage.scanLibrary.form.enabledStateOff') }}
                      </span>
                    </div>
                    <USwitch v-model="scanLibraryFormState.enabled" color="success" />
                  </div>
                  <p class="mt-1.5 flex items-start gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                    <UIcon name="tabler:info-circle" class="size-3.5 shrink-0 mt-px" />
                    {{ $t('settings.storage.scanLibrary.form.enabledHint') }}
                  </p>
                </UFormField>
                <UFormField
                  :ui="{ container: 'sm:max-w-full' }"
                >
                  <div class="flex w-full items-center justify-between gap-4 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 px-3 py-2.5">
                    <div class="flex flex-col gap-0.5">
                      <span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {{ $t('settings.storage.scanLibrary.form.asAlbumLabel') }}
                      </span>
                      <span
                        class="text-xs"
                        :class="scanLibraryFormState.asAlbum
                          ? 'text-primary-600 dark:text-primary-400'
                          : 'text-neutral-400 dark:text-neutral-500'"
                      >
                        {{ scanLibraryFormState.asAlbum
                          ? $t('settings.storage.scanLibrary.form.asAlbumStateOn')
                          : $t('settings.storage.scanLibrary.form.asAlbumStateOff') }}
                      </span>
                    </div>
                    <USwitch v-model="scanLibraryFormState.asAlbum" color="primary" />
                  </div>
                  <p class="mt-1.5 flex items-start gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                    <UIcon name="tabler:book-2" class="size-3.5 shrink-0 mt-px" />
                    {{ $t('settings.storage.scanLibrary.form.asAlbumHint') }}
                  </p>
                </UFormField>
              </div>

              <div
                v-else-if="scanLibInfo"
                class="space-y-4"
              >
                <div
                  class="grid gap-px rounded-md bg-neutral-100 dark:bg-neutral-800 overflow-hidden"
                >
                  <div class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.info.name') }}
                    </span>
                    <span class="max-w-[60%] text-right text-sm font-medium text-neutral-900 dark:text-neutral-100 break-words">
                      {{ scanLibInfo.name }}
                    </span>
                  </div>
                  <div class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.info.path') }}
                    </span>
                    <span class="max-w-[60%] text-right text-sm font-medium text-neutral-900 dark:text-neutral-100 break-all">
                      {{ scanLibInfo.rootPath }}
                    </span>
                  </div>
                  <div class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.info.provider') }}
                    </span>
                    <span class="text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {{ scanLibInfo.provider }}
                    </span>
                  </div>
                  <div class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.info.status') }}
                    </span>
                    <UChip
                      size="md"
                      inset
                      standalone
                      :color="scanLibInfo.enabled ? 'success' : undefined"
                      :label="$t(
                        scanLibInfo.enabled
                          ? 'settings.storage.scanLibrary.info.enabled'
                          : 'settings.storage.scanLibrary.info.disabled',
                      )"
                      :ui="{
                        base: scanLibInfo.enabled
                          ? 'font-medium'
                          : 'font-medium bg-neutral-300 dark:bg-neutral-700',
                      }"
                    />
                  </div>
                  <div class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.info.interval') }}
                    </span>
                    <div class="text-right">
                      <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {{ $t('settings.storage.scanLibrary.info.intervalMs', { value: scanLibInfo.watchIntervalMs }) }}
                      </span>
                    </div>
                  </div>
                  <div class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.info.photoIndexed') }}
                    </span>
                    <span class="text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {{ scanLibInfo.photoCount }}
                    </span>
                  </div>
                  <div class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.info.displayMode') }}
                    </span>
                    <span class="flex max-w-[60%] items-center justify-end gap-1.5 text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      <UIcon
                        :name="scanLibInfo.asAlbum ? 'tabler:book-2' : 'tabler:photo'"
                        class="size-4"
                        :class="scanLibInfo.asAlbum ? 'text-primary-500' : 'text-neutral-400'"
                      />
                      {{ scanLibInfo.asAlbum
                        ? $t('settings.storage.scanLibrary.info.modeAlbum')
                        : $t('settings.storage.scanLibrary.info.modeGallery') }}
                    </span>
                  </div>
                  <div class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.info.scannedAt') }}
                    </span>
                    <span class="max-w-[60%] text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {{ fmtScanTime(scanLibInfo.lastScanAt) }}
                    </span>
                  </div>
                  <div v-if="scanLibInfo.lastScanResult" class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.info.scanResult') }}
                    </span>
                    <span class="max-w-[60%] text-right">
                      <ScanResultBadges :raw="scanLibInfo.lastScanResult" />
                    </span>
                  </div>
                  <div v-if="scanLibInfo.createdAt" class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.info.createdAt') }}
                    </span>
                    <span class="text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {{ fmtScanTime(scanLibInfo.createdAt) }}
                    </span>
                  </div>
                  <div v-if="scanLibInfo.updatedAt" class="bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between gap-4 px-4 py-3">
                    <span class="text-sm text-neutral-500 dark:text-neutral-400">
                      {{ $t('settings.storage.scanLibrary.info.updatedAt') }}
                    </span>
                    <span class="text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {{ fmtScanTime(scanLibInfo.updatedAt) }}
                    </span>
                  </div>
                </div>
              </div>
            </template>
            <template #footer="{ close }">
              <template v-if="scanLibSlideover.mode === 'edit'">
                <UButton
                  :label="$t('common.actions.cancel')"
                  color="neutral"
                  variant="outline"
                  @click="close"
                />
                <UButton
                  :label="$t('settings.storage.scanLibrary.actions.save')"
                  variant="soft"
                  icon="tabler:check"
                  @click="onScanLibrarySubmit(close)"
                />
              </template>
              <template v-else>
                <UButton
                  :label="$t('common.actions.close')"
                  color="neutral"
                  variant="outline"
                  @click="close"
                />
              </template>
            </template>
          </USlideover>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
