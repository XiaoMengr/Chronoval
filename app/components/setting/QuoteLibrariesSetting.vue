<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

/**
 * 「随机照片轮经典语录」内置语录库编辑器。
 * 古诗 / 现代 两个标签各一行一条，保存到 system:randomWheel.quoteLibraries。
 */

interface QuoteLibraries {
  ancient: string[]
  modern: string[]
}

const props = defineProps<{
  modelValue?: QuoteLibraries | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, string[]>]
  save: [value: Record<string, string[]>]
}>()

// 本地编辑态：两个标签各为一个文本域（每行一条）
const draft = ref<Record<'ancient' | 'modern', string>>({
  ancient: '',
  modern: '',
})

const isDirty = ref(false)
const isLoading = ref(false)
const isSaving = ref(false)

const countOf = (tag: 'ancient' | 'modern') =>
  draft.value[tag]
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean).length

const ancientCount = computed(() => countOf('ancient'))
const modernCount = computed(() => countOf('modern'))

const toLines = (arr: string[] | undefined) => (arr || []).join('\n')

const wire = (libs: QuoteLibraries) => {
  draft.value.ancient = toLines(libs.ancient)
  draft.value.modern = toLines(libs.modern)
}

const loadLibraries = async () => {
  isLoading.value = true
  try {
    if (props.modelValue) {
      wire(props.modelValue as QuoteLibraries)
    } else {
      const res = await $fetch('/api/system/settings/quote-libraries', {
        method: 'GET',
      })
      wire(res.libraries)
    }
  } catch {
    /* 加载失败保持空草稿，让用户可自行填写 */
  } finally {
    isLoading.value = false
  }
}

const asSaveValue = (): Record<'ancient' | 'modern', string[]> => ({
  ancient: draft.value.ancient
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
  modern: draft.value.modern
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
})

const buildValue = (): Record<string, string[]> => asSaveValue()

watch(() => props.modelValue, () => {
  if (props.modelValue) wire(props.modelValue as QuoteLibraries)
})

const markDirty = () => {
  isDirty.value = true
  emit('update:modelValue', buildValue())
}

const resetAll = () => {
  if (props.modelValue) wire(props.modelValue as QuoteLibraries)
  isDirty.value = false
}

const handleSave = async () => {
  isSaving.value = true
  try {
    await $fetch('/api/system/settings/quote-libraries', {
      method: 'PUT',
      body: { libraries: asSaveValue() },
    })
    isDirty.value = false
    emit('update:modelValue', buildValue())
    emit('save', buildValue())
    useToast().add({
      title: $t('settings.system.quoteLibraries.saved'),
      color: 'success',
    })
  } catch {
    useToast().add({
      title: $t('settings.system.quoteLibraries.saveFailed'),
      color: 'error',
    })
  } finally {
    isSaving.value = false
  }
}

onMounted(loadLibraries)
</script>

<template>
  <div>
    <div v-if="isLoading" class="flex items-center justify-center px-5 py-12">
      <UIcon name="tabler:loader" class="h-8 w-8 animate-spin text-primary-500" />
    </div>

    <div v-else class="space-y-8 px-2 py-2">
      <!-- 现代语录库 -->
      <div>
        <div class="mb-2 flex items-center justify-between gap-2">
          <label
            class="inline-flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100"
          >
            <Icon name="tabler:camera" class="size-4 text-primary-500" />
            {{ $t('settings.system.quoteLibraries.modern') }}
          </label>
          <span
            class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-950/40 dark:text-primary-300"
          >
            {{ $t('settings.system.quoteLibraries.count', { count: modernCount }) }}
          </span>
        </div>
        <UTextarea
          :model-value="draft.modern"
          class="w-full"
          :rows="8"
          :placeholder="$t('settings.system.quoteLibraries.placeholder')"
          @update:model-value="(v) => { draft.modern = String(v); markDirty() }"
        />
      </div>

      <!-- 古诗语录库 -->
      <div>
        <div class="mb-2 flex items-center justify-between gap-2">
          <label
            class="inline-flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100"
          >
            <Icon name="tabler:book" class="size-4 text-primary-500" />
            {{ $t('settings.system.quoteLibraries.ancient') }}
          </label>
          <span
            class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-950/40 dark:text-primary-300"
          >
            {{ $t('settings.system.quoteLibraries.count', { count: ancientCount }) }}
          </span>
        </div>
        <UTextarea
          :model-value="draft.ancient"
          class="w-full"
          :rows="8"
          :placeholder="$t('settings.system.quoteLibraries.placeholder')"
          @update:model-value="(v) => { draft.ancient = String(v); markDirty() }"
        />
      </div>

      <footer class="flex items-center justify-end gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div
          v-if="isDirty"
          class="mr-auto rounded-md border border-warning-200 bg-warning-50 px-3 py-1.5 text-xs text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
        >
          {{ $t('common.unsavedChanges') }}
        </div>
        <UButton
          color="neutral"
          variant="outline"
          :disabled="!isDirty"
          @click="resetAll"
        >
          {{ $t('common.actions.reset') }}
        </UButton>
        <UButton
          :loading="isSaving"
          :disabled="!isDirty"
          icon="tabler:device-floppy"
          @click="handleSave"
        >
          {{ $t('common.actions.saveSettings') }}
        </UButton>
      </footer>
    </div>
  </div>
</template>