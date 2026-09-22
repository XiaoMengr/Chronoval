<script setup lang="ts">

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('dashboard.music.title'),
})

const toast = useToast()

interface MusicItem {
  id: number
  title: string
  filename: string
  mimeType: string | null
  duration: number | null
  fileSize: number
  url: string
  createdAt: string
}

const musicList = ref<MusicItem[]>([])
const isLoading = ref(false)
const isUploading = ref(false)
const isUploadOpen = ref(false)

// 播放控制
const playingId = ref<number | null>(null)
const audioRef = ref<HTMLAudioElement | null>(null)
const currentMusic = computed(() =>
  musicList.value.find((m) => m.id === playingId.value),
)

// 小于 10MB 允许前端试听？BGM 一律走服务端流式地址，前端直接播放
const isPlaying = (id: number) => playingId.value === id

const togglePlay = (item: MusicItem) => {
  if (playingId.value === item.id) {
    stopPlay()
    return
  }
  stopPlay(true)
  playingId.value = item.id
  requestAnimationFrame(() => {
    const el = audioRef.value
    if (el) {
      el.src = item.url
      el.play().catch(() => {
        toast.add({ title: $t('dashboard.music.playFail'), color: 'error' })
      })
    }
  })
}

const stopPlay = (keepEl = false) => {
  playingId.value = null
  const el = audioRef.value
  if (el && !keepEl) {
    el.pause()
    el.removeAttribute('src')
    el.load()
  }
}

const onEnded = () => (playingId.value = null)

const formatDuration = (s: number | null) => {
  if (!s || Number.isNaN(s)) return '--:--'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

const formatSize = (b: number) => {
  if (!b) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let val = b
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

const fmtDate = (d: string) => {
  if (!d) return ''
  return new Date(d).toLocaleString()
}

const loadMusic = async () => {
  isLoading.value = true
  try {
    musicList.value = (await $fetch('/api/music')) as MusicItem[]
  } catch {
    toast.add({ title: $t('dashboard.music.loadFail'), color: 'error' })
  } finally {
    isLoading.value = false
  }
}

onMounted(loadMusic)
onBeforeUnmount(stopPlay)

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const customTitle = ref('')

const triggerPick = () => fileInput.value?.click()

const onFileChange = (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) selectedFile.value = f
}

const uploadMusic = async () => {
  if (!selectedFile.value) return
  isUploading.value = true
  try {
    const form = new FormData()
    form.append('file', selectedFile.value)
    if (customTitle.value.trim()) form.append('title', customTitle.value.trim())
    await $fetch('/api/music', { method: 'POST', body: form })
    toast.add({ title: $t('dashboard.music.uploadSuccess'), color: 'success' })
    isUploadOpen.value = false
    selectedFile.value = null
    customTitle.value = ''
    await loadMusic()
  } catch (e: any) {
    toast.add({
      title:
        e?.statusCode === 415
          ? $t('dashboard.music.invalidFile')
          : $t('dashboard.music.uploadFail'),
      color: 'error',
    })
  } finally {
    isUploading.value = false
  }
}

const confirmDelete = ref(false)
const targetDelete = ref<MusicItem | null>(null)

const requestDelete = (item: MusicItem) => {
  targetDelete.value = item
  confirmDelete.value = true
}

const doDelete = async () => {
  if (!targetDelete.value) return
  try {
    await $fetch(`/api/music/${targetDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: $t('dashboard.music.deleteSuccess'), color: 'success' })
    if (playingId.value === targetDelete.value.id) stopPlay(true)
    confirmDelete.value = false
    targetDelete.value = null
    await loadMusic()
  } catch {
    toast.add({ title: $t('dashboard.music.deleteFail'), color: 'error' })
  }
}

// 编辑标题就地重命名
const editingId = ref<number | null>(null)
const editingTitle = ref('')

const startEditTitle = (item: MusicItem) => {
  // 音乐标题修改：此处通过删除+重传不现实，改为在播放列表直接记录——为简化体验，
  // 标题调整放音乐盒列表内；真正的持久化通过一个轻量 PATCH 完成。
  editingId.value = item.id
  editingTitle.value = item.title
}

const saveTitle = async () => {
  if (!editingId.value) return
  try {
    await $fetch(`/api/music/${editingId.value}`, {
      method: 'PUT',
      body: { title: editingTitle.value.trim() },
    })
    const target = musicList.value.find((m) => m.id === editingId.value)
    if (target) target.title = editingTitle.value.trim()
    toast.add({ title: $t('dashboard.music.renameSuccess'), color: 'success' })
  } catch {
    toast.add({ title: $t('dashboard.music.renameFail'), color: 'error' })
  } finally {
    editingId.value = null
  }
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <!-- 音频播放器（隐藏） -->
    <audio
      ref="audioRef"
      class="hidden"
      @ended="onEnded"
    />

    <div class="flex flex-col gap-4 p-4 md:p-6">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-(--ui-text)">
            {{ $t('dashboard.music.title') }}
          </h1>
          <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {{ $t('dashboard.music.subtitle') }}
          </p>
        </div>
        <UButton
          icon="tabler:music-plus"
          color="primary"
          size="lg"
          class="shrink-0"
          @click="isUploadOpen = !isUploadOpen"
        >
          {{ $t('dashboard.music.uploadButton') }}
        </UButton>
      </header>

      <!-- 上传面板 -->
      <div
        v-if="isUploadOpen"
        class="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/40"
      >
        <div class="flex flex-col gap-3">
          <div
            class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-8 text-center transition hover:border-primary-400 hover:bg-primary-50/40 dark:border-neutral-700 dark:hover:border-primary-500 dark:hover:bg-primary-500/5"
            @click="triggerPick"
          >
            <Icon name="tabler:upload" class="size-8 text-neutral-400" />
            <p class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {{
                selectedFile
                  ? selectedFile.name
                  : $t('dashboard.music.dropHint')
              }}
            </p>
            <p class="text-xs text-neutral-500">
              {{ $t('dashboard.music.dropHintDesc') }}
            </p>
            <input
              ref="fileInput"
              type="file"
              accept="audio/*"
              class="hidden"
              @change="onFileChange"
            />
          </div>

          <UFormField
            :label="$t('dashboard.music.titleLabel')"
            class="w-full"
          >
            <UInput
              v-model="customTitle"
              :placeholder="$t('dashboard.music.titlePlaceholder')"
            />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              @click="isUploadOpen = false"
            >
              {{ $t('common.cancel') }}
            </UButton>
            <UButton
              color="primary"
              :loading="isUploading"
              :disabled="!selectedFile"
              icon="tabler:upload"
              @click="uploadMusic"
            >
              {{ $t('dashboard.music.uploadButton') }}
            </UButton>
          </div>
        </div>
      </div>

      <!-- 正在播放条 -->
      <div
        v-if="currentMusic"
        class="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3 dark:border-primary-800 dark:bg-primary-500/10"
      >
        <span class="relative flex size-6 items-center justify-center">
          <Icon name="tabler:disc" class="size-6 animate-spin text-primary-500" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-primary-900 dark:text-primary-100">
            {{ currentMusic.title }}
          </p>
          <p class="text-xs text-primary-600/80">
            {{ $t('dashboard.music.nowPlaying') }}
          </p>
        </div>
        <UButton
          icon="tabler:player-stop"
          size="sm"
          variant="soft"
          color="primary"
          @click="stopPlay()"
        >
          {{ $t('dashboard.music.stop') }}
        </UButton>
      </div>

      <!-- 列表 -->
      <div
        v-if="isLoading"
        class="flex justify-center py-16"
      >
        <UIcon name="svg-spinners:ring-resize" class="size-8 text-primary" />
      </div>

      <div
        v-else-if="musicList.length === 0"
        class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-300 py-16 text-center dark:border-neutral-700"
      >
        <Icon name="tabler:music" class="size-12 text-neutral-300 dark:text-neutral-600" />
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ $t('dashboard.music.empty') }}
        </p>
        <UButton
          variant="outline"
          color="primary"
          icon="tabler:music-plus"
          @click="isUploadOpen = true"
        >
          {{ $t('dashboard.music.emptyCta') }}
        </UButton>
      </div>

      <div
        v-else
        class="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800"
      >
        <div class="divide-y divide-neutral-100 dark:divide-neutral-800">
          <div
            v-for="(item, idx) in musicList"
            :key="item.id"
            class="group flex items-center gap-3 px-4 py-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
          >
            <span class="w-6 shrink-0 text-right text-xs tabular-nums text-neutral-400">
              {{ idx + 1 }}
            </span>

            <UButton
              :icon="isPlaying(item.id) ? 'tabler:player-pause' : 'tabler:player-play'"
              size="sm"
              :color="isPlaying(item.id) ? 'primary' : 'neutral'"
              :variant="isPlaying(item.id) ? 'solid' : 'soft'"
              circle
              class="shrink-0"
              @click="togglePlay(item)"
            />

            <div class="min-w-0 flex-1">
              <!-- 标题：就地重命名 -->
              <div v-if="editingId === item.id" class="flex items-center gap-1.5">
                <UInput
                  v-model="editingTitle"
                  size="sm"
                  class="max-w-64"
                  @keyup.enter="saveTitle"
                />
                <UButton
                  icon="tabler:check"
                  size="sm"
                  color="primary"
                  variant="soft"
                  @click="saveTitle"
                />
              </div>
              <template v-else>
                <p class="truncate text-sm font-medium text-(--ui-text)">
                  {{ item.title }}
                </p>
                <p class="truncate text-xs text-neutral-500">
                  {{ item.filename }}
                  <span v-if="item.mimeType" class="ml-1 text-neutral-400">
                    {{ item.mimeType }}
                  </span>
                </p>
              </template>
            </div>

            <span class="hidden shrink-0 text-xs tabular-nums text-neutral-500 sm:block">
              {{ formatDuration(item.duration) }}
            </span>
            <span class="hidden w-20 shrink-0 text-right text-xs tabular-nums text-neutral-500 sm:block">
              {{ formatSize(item.fileSize) }}
            </span>
            <span class="hidden w-36 shrink-0 text-right text-xs tabular-nums text-neutral-400 lg:block">
              {{ fmtDate(item.createdAt) }}
            </span>

            <div class="flex shrink-0 items-center gap-1">
              <UButton
                icon="tabler:pencil"
                size="sm"
                variant="ghost"
                color="neutral"
                @click="startEditTitle(item)"
              />
              <UButton
                icon="tabler:trash"
                size="sm"
                variant="ghost"
                color="error"
                @click="requestDelete(item)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <UModal v-model:open="confirmDelete">
      <UCard
        :ui="{ body: { base: 'space-y-4' } }"
      >
        <template #header>
          <div class="flex items-center gap-2">
            <Icon name="tabler:trash" class="size-5 text-(--ui-error)" />
            <h3 class="font-semibold">
              {{ $t('dashboard.music.deleteTitle') }}
            </h3>
          </div>
        </template>
        <p class="text-sm text-neutral-600 dark:text-neutral-300">
          {{
            $t('dashboard.music.deleteConfirm', {
              title: targetDelete?.title,
            })
          }}
        </p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              @click="confirmDelete = false"
            >
              {{ $t('common.cancel') }}
            </UButton>
            <UButton
              color="error"
              icon="tabler:trash"
              @click="doDelete"
            >
              {{ $t('dashboard.music.deleteAction') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>