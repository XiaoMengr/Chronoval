<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

useHead({ title: () => $t('dashboard.music.title') })

import { parseLrc } from '~/utils/lrc'

const toast = useToast()
const router = useRouter()

interface MusicItem {
  id: number
  title: string
  filename: string
  mimeType: string | null
  duration: number | null
  fileSize: number
  lyrics: string | null
  coverUrl: string | null
  url: string
  createdAt: string
}

const musicList = ref<MusicItem[]>([])
const isLoading = ref(false)
const isUploading = ref(false)
const isUploadOpen = ref(false)

// ---- 播放控制 ----
const playingId = ref<number | null>(null)
const audioRef = ref<HTMLAudioElement | null>(null)
const progress = ref(0)
const duration = ref(0)

// 音频真实播放状态：由 audio 的 play/pause 事件驱动（el.paused 是 DOM 属性，非响应式，
// 直接读取会导致计算属性在音频开始播放后不更新，碟片/唱臂无法响应）
const audioPlaying = ref(false)

const currentMusic = computed(() =>
  musicList.value.find((m) => m.id === playingId.value) || null,
)
const isPlaying = computed(() =>
  audioPlaying.value && playingId.value !== null,
)

const playPct = computed(() =>
  duration.value ? (progress.value / duration.value) * 100 : 0,
)

// ---- 歌词专注模式（点击碟片切换，再点击中间返回）----
const lyricsMode = ref(false)

const togglePlay = (item: MusicItem) => {
  const el = audioRef.value
  if (!el) return
  if (playingId.value === item.id) {
    if (isPlaying.value) {
      el.pause()
    } else {
      el.play().catch(() => toast.add({ title: $t('dashboard.music.playFail'), color: 'error' }))
    }
    return
  }
  playingId.value = item.id
  progress.value = 0
  duration.value = 0
  el.src = item.url
  el.play().catch(() => toast.add({ title: $t('dashboard.music.playFail'), color: 'error' }))
}

const stopPlay = () => {
  const el = audioRef.value
  if (!el) return
  el.pause()
  el.removeAttribute('src')
  el.load()
  playingId.value = null
  progress.value = 0
  duration.value = 0
}

const onTimeUpdate = () => {
  const el = audioRef.value
  if (!el) return
  if (el.duration && Number.isFinite(el.duration)) duration.value = el.duration
  progress.value = el.currentTime
}

const seekTo = (v: number) => {
  const el = audioRef.value
  if (!el) return
  el.currentTime = v
  progress.value = v
}

const onEnded = () => {
  const el = audioRef.value
  if (!el) return
  el.currentTime = 0
  progress.value = 0
  el.play().catch(() => {})
}

// ---- 网易云/Apple Music 式展开播放器 ----
const playerOpen = ref(false)
const expandPlayer = () => {
  playerOpen.value = true
}
const openPlayerFor = (item: MusicItem) => {
  if (playingId.value !== item.id) togglePlay(item)
  playerOpen.value = true
}

// 收起播放器时复位歌词专注模式
watch(playerOpen, (open) => {
  if (!open) lyricsMode.value = false
})

// 歌词解析
const lyricsLines = computed(() => parseLrc(currentMusic.value?.lyrics))
const activeLyricIndex = computed(() => {
  const lines = lyricsLines.value
  if (lines.length === 0) return -1
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= progress.value) idx = i
    else break
  }
  return idx
})
const hasLyrics = computed(() => lyricsLines.value.length > 0)

// 歌词滚动容器
const lyricsScrollRef = ref<HTMLElement | null>(null)
watch(activeLyricIndex, (idx) => {
  if (idx < 0 || !hasLyrics.value) return
  nextTick(() => {
    const wrap = lyricsScrollRef.value
    if (!wrap) return
    const active = wrap.querySelector<HTMLElement>('.lyric-line-active')
    if (!active) return
    const wrapH = wrap.clientHeight
    const t = active.offsetTop - wrapH / 2 + active.clientHeight / 2
    wrap.scrollTo({ top: t, behavior: 'smooth' })
  })
})

const formatTime = (s: number | null) => {
  if (s === null || s === undefined || Number.isNaN(s)) return '--:--'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

const formatDuration = formatTime

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
  return new Date(d).toLocaleDateString()
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

onMounted(() => {
  loadMusic()
})

onBeforeUnmount(() => {
  stopPlay()
})

// ---- 上传 ----
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const customTitle = ref('')
const customLyrics = ref('')

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
    if (customLyrics.value.trim()) form.append('lyrics', customLyrics.value.trim())
    await $fetch('/api/music', { method: 'POST', body: form })
    toast.add({ title: $t('dashboard.music.uploadSuccess'), color: 'success' })
    isUploadOpen.value = false
    selectedFile.value = null
    customTitle.value = ''
    customLyrics.value = ''
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

// ---- 删除 ----
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
    if (playingId.value === targetDelete.value.id) stopPlay()
    confirmDelete.value = false
    targetDelete.value = null
    await loadMusic()
  } catch {
    toast.add({ title: $t('dashboard.music.deleteFail'), color: 'error' })
  }
}

// ---- 就地重命名 ----
const editingId = ref<number | null>(null)
const editingTitle = ref('')
const startEditTitle = (item: MusicItem) => {
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

// ---- 歌词编辑 ----
const lyricsEditModal = ref(false)
const lyricsEditTarget = ref<MusicItem | null>(null)
const lyricsDraft = ref('')
const openLyricsEditor = (item: MusicItem) => {
  lyricsEditTarget.value = item
  lyricsDraft.value = item.lyrics || ''
  lyricsEditModal.value = true
}
const saveLyrics = async () => {
  if (!lyricsEditTarget.value) return
  try {
    await $fetch(`/api/music/${lyricsEditTarget.value.id}`, {
      method: 'PUT',
      body: { lyrics: lyricsDraft.value.trim() || null },
    })
    const target = musicList.value.find((m) => m.id === lyricsEditTarget.value!.id)
    if (target) target.lyrics = lyricsDraft.value.trim() || null
    toast.add({ title: $t('dashboard.music.lyricsSaved'), color: 'success' })
    lyricsEditModal.value = false
    lyricsEditTarget.value = null
  } catch {
    toast.add({ title: $t('dashboard.music.lyricsSaveFail'), color: 'error' })
  }
}

const playAll = () => {
  if (musicList.value.length === 0) return
  togglePlay(musicList.value[0]!)
  playerOpen.value = true
}

// ---- 自定义封面 ----
const coverInput = ref<HTMLInputElement | null>(null)
const coverTargetId = ref<number | null>(null)
const coverUploading = ref(false)

// 横幅展示的封面：优先当前播放曲目，否则取第一首
const bannerMusic = computed<MusicItem | null>(
  () => currentMusic.value || musicList.value[0] || null,
)
const bannerCover = computed(() => bannerMusic.value?.coverUrl || null)

const pickCover = (item: MusicItem) => {
  coverTargetId.value = item.id
  coverInput.value?.click()
}

const onCoverChange = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || coverTargetId.value === null) return
  if (!file.type.startsWith('image/')) {
    toast.add({ title: $t('dashboard.music.coverInvalid'), color: 'error' })
    return
  }
  coverUploading.value = true
  try {
    const form = new FormData()
    form.append('cover', file)
    const updated = (await $fetch(`/api/music/${coverTargetId.value}/cover`, {
      method: 'PUT',
      body: form,
    })) as MusicItem
    const idx = musicList.value.findIndex((m) => m.id === updated.id)
    if (idx !== -1) musicList.value[idx] = updated
    toast.add({ title: $t('dashboard.music.coverSuccess'), color: 'success' })
  } catch {
    toast.add({ title: $t('dashboard.music.coverFail'), color: 'error' })
  } finally {
    coverUploading.value = false
    coverTargetId.value = null
  }
}
</script>

<template>
  <!--
    必须使用 UDashboardPanel 的 #body 命名插槽：面板内部的滚动容器（flex-1 overflow-y-auto）
    只在渲染 #body 插槽时才会生成。若把内容放进默认插槽，滚动容器不会渲染，
    内容会被 dashboard 布局的 overflow-hidden 裁掉，导致移动端无法滚动/只显示一半。
  -->
  <UDashboardPanel :ui="{ body: 'flex flex-col gap-0 p-0' }">
    <template #body>
    <audio
      ref="audioRef"
      class="hidden"
      @timeupdate="onTimeUpdate"
      @ended="onEnded"
      @play="audioPlaying = true"
      @pause="audioPlaying = false"
    />
    <input
      ref="coverInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onCoverChange"
    />

    <!-- ===== 顶部沉浸式横幅（Apple Music 专辑页风格 + 汽水音乐高斯模糊） ===== -->
    <header class="relative shrink-0 overflow-hidden">
      <!-- 移动端返回首页按钮（桌面端侧栏已有导航，无需重复） -->
      <div class="absolute left-4 top-4 z-10 lg:hidden">
        <UButton
          icon="tabler:home"
          variant="soft"
          color="neutral"
          aria-label="返回首页"
          :title="$t('dashboard.nav.home')"
          class="bg-white/15 text-white hover:bg-white/25"
          @click="router.push('/')"
        />
      </div>

      <!-- 封面高斯模糊背景 -->
      <template v-if="bannerCover">
        <img
          :src="bannerCover"
          alt=""
          class="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl"
        />
        <div class="absolute inset-0 bg-black/45" />
        <div
          class="absolute inset-0"
          style="background: linear-gradient(to bottom, rgba(12,4,6,0.15) 0%, rgba(12,4,6,0.9) 100%)"
        />
      </template>
      <!-- 无封面时的红黑渐变兜底 -->
      <div v-else class="absolute inset-0 bg-linear-to-br from-[#b0222a] via-[#d62828] to-[#2a0608]" />

      <div class="relative mx-auto w-full max-w-6xl px-5 pb-8 pt-10 sm:px-8 sm:pb-12 sm:pt-16">
        <div class="flex flex-col items-center gap-7 sm:flex-row sm:items-end sm:justify-start sm:gap-10">
          <!-- 左侧：旋转黑胶（点击可设置封面） -->
          <div class="relative flex items-center justify-center sm:justify-start">
            <button
              type="button"
              class="group relative block"
              :title="$t('dashboard.music.setCover')"
              @click="bannerMusic && pickCover(bannerMusic)"
            >
              <MusicVinyl
                :spinning="isPlaying"
                :size="'min(150px, 44vw)'"
                :cover="bannerCover"
                class="drop-shadow-[0_24px_50px_rgba(0,0,0,0.6)]"
              />
              <span
                class="absolute inset-0 grid place-items-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100"
              >
                <Icon name="tabler:camera" class="size-8 text-white" />
              </span>
            </button>
          </div>

          <!-- 右侧：标题区 -->
          <div class="min-w-0 text-center text-white sm:text-left">
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-white/55">
              {{ $t('dashboard.music.listCount') }}
            </p>
            <h1 class="mt-1.5 text-4xl font-bold tracking-tight sm:text-6xl">
              {{ $t('dashboard.music.title') }}
            </h1>
            <p class="mt-2.5 max-w-md text-sm leading-relaxed text-white/70">
              {{ $t('dashboard.music.subtitle') }}
            </p>
            <div class="mt-5 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <UButton
                color="white"
                icon="tabler:player-play-filled"
                class="font-semibold"
                @click="playAll"
              >
                {{ $t('dashboard.music.playAll') }}
              </UButton>
              <UButton
                :color="null"
                variant="soft"
                class="bg-white/15 text-white hover:bg-white/25"
                icon="tabler:music-plus"
                @click="isUploadOpen = !isUploadOpen"
              >
                {{ $t('dashboard.music.uploadButton') }}
              </UButton>
              <span class="text-sm text-white/70">
                {{ $t('dashboard.music.totalCount', { count: musicList.length }) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- ===== 主体内容 ===== -->
    <main class="mx-auto w-full max-w-6xl px-4 py-5 pb-36 sm:px-8 sm:py-8 sm:pb-36">
      <!-- 上传面板 -->
      <div v-if="isUploadOpen"
        class="rounded-2xl border border-(--ui-border) bg-(--ui-bg) p-4 shadow-sm">
        <div class="flex flex-col gap-3">
          <div
            class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-(--ui-border-accented) px-4 py-7 text-center transition hover:border-red-400 hover:bg-red-50/40 dark:hover:border-red-500 dark:hover:bg-red-500/5"
            @click="triggerPick"
          >
            <Icon name="tabler:upload" class="size-8 text-(--ui-text-muted)" />
            <p class="text-sm font-medium text-(--ui-text)">
              {{ selectedFile ? selectedFile.name : $t('dashboard.music.dropHint') }}
            </p>
            <p class="text-xs text-(--ui-text-muted)">{{ $t('dashboard.music.dropHintDesc') }}</p>
            <input ref="fileInput" type="file" accept="audio/*" class="hidden" @change="onFileChange" />
          </div>

          <UFormField :label="$t('dashboard.music.titleLabel')" class="w-full">
            <UInput v-model="customTitle" :placeholder="$t('dashboard.music.titlePlaceholder')" />
          </UFormField>
          <UFormField :label="$t('dashboard.music.lyricsLabel')" class="w-full">
            <UTextarea
              v-model="customLyrics"
              :placeholder="$t('dashboard.music.lyricsPlaceholder')"
              :rows="4"
            />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="isUploadOpen = false">
              {{ $t('common.cancel') }}
            </UButton>
            <UButton color="primary" :loading="isUploading" :disabled="!selectedFile" icon="tabler:upload" @click="uploadMusic">
              {{ $t('dashboard.music.uploadButton') }}
            </UButton>
          </div>
        </div>
      </div>

      <!-- 加载 / 空态 / 列表 -->
      <div v-if="isLoading" class="flex justify-center py-20">
        <UIcon name="svg-spinners:ring-resize" class="size-8 text-red-500" />
      </div>

      <div v-else-if="musicList.length === 0"
        class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-(--ui-border-accented) py-20 text-center">
        <div class="relative">
          <div class="size-20 rounded-full bg-linear-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800" />
          <Icon name="tabler:music" class="absolute inset-0 m-auto size-8 text-(--ui-text-muted)" />
        </div>
        <p class="text-sm text-(--ui-text-muted)">{{ $t('dashboard.music.empty') }}</p>
        <UButton variant="outline" color="primary" icon="tabler:music-plus" @click="isUploadOpen = true">
          {{ $t('dashboard.music.emptyCta') }}
        </UButton>
      </div>

      <div v-else class="overflow-hidden rounded-2xl border border-(--ui-border) bg-(--ui-bg) shadow-sm">
        <div class="divide-y divide-(--ui-border)">
          <div
            v-for="item in musicList"
            :key="item.id"
            class="group flex items-center gap-3 px-3 py-2.5 transition hover:bg-red-50/50 dark:hover:bg-red-500/5"
            :class="{ 'bg-red-50/70 dark:bg-red-500/10': playingId === item.id }"
          >
            <!-- 封面缩略（点击可设置封面） -->
            <span class="relative w-10 shrink-0">
              <button
                type="button"
                class="group/cov relative block rounded-full"
                :title="$t('dashboard.music.setCover')"
                @click="pickCover(item)"
              >
                <MusicVinyl
                  :spinning="playingId === item.id && isPlaying"
                  :size="38"
                  :cover="item.coverUrl"
                />
                <span
                  class="absolute inset-0 grid place-items-center rounded-full bg-black/40 opacity-0 transition group-hover/cov:opacity-100"
                >
                  <Icon name="tabler:camera" class="size-3.5 text-white" />
                </span>
              </button>
              <!-- 播放/暂停角标 -->
              <button
                v-if="playingId === item.id"
                type="button"
                class="absolute inset-0 grid place-items-center rounded-full bg-black/25"
                @click="togglePlay(item)"
              >
                <Icon
                  :name="isPlaying ? 'tabler:player-pause-filled' : 'tabler:player-play-filled'"
                  class="size-4 text-white"
                />
              </button>
              <button
                v-else
                type="button"
                class="absolute inset-0 hidden place-items-center rounded-full bg-black/25 group-hover:grid"
                @click="togglePlay(item)"
              >
                <Icon name="tabler:player-play-filled" class="size-4 text-white" />
              </button>
            </span>

            <!-- 标题区 -->
            <div class="min-w-0 flex-1">
              <div v-if="editingId === item.id" class="flex items-center gap-1.5">
                <UInput v-model="editingTitle" size="sm" class="max-w-56" @keyup.enter="saveTitle" />
                <UButton icon="tabler:check" size="sm" color="primary" variant="soft" @click="saveTitle" />
              </div>
              <template v-else>
                <div class="flex items-center gap-2">
                  <button type="button" class="min-w-0 truncate text-left text-sm font-semibold text-(--ui-text) hover:text-red-500"
                    @click="openPlayerFor(item)">
                    {{ item.title }}
                  </button>
                  <Icon v-if="item.lyrics" name="tabler:microphone-2" size="13" class="shrink-0 text-red-400" :title="$t('dashboard.music.editLyrics')" />
                </div>
                <p class="truncate text-xs text-(--ui-text-muted)">{{ item.filename }}</p>
              </template>
            </div>

            <!-- 元数据（移动端隐藏，保持行紧凑） -->
            <span class="hidden shrink-0 text-xs tabular-nums text-(--ui-text-muted) sm:block">{{ formatDuration(item.duration) }}</span>
            <span class="hidden w-16 shrink-0 text-right text-xs tabular-nums text-(--ui-text-muted) sm:block">{{ formatSize(item.fileSize) }}</span>
            <span class="hidden w-20 shrink-0 text-right text-xs tabular-nums text-(--ui-text-muted) lg:block">{{ fmtDate(item.createdAt) }}</span>

            <!-- 操作 -->
            <div class="flex shrink-0 items-center gap-1">
              <UButton icon="tabler:microphone-2" size="sm" variant="ghost" color="neutral"
                :title="$t('dashboard.music.editLyrics')" @click="openLyricsEditor(item)" />
              <UButton icon="tabler:pencil" size="sm" variant="ghost" color="neutral"
                @click="startEditTitle(item)" />
              <UButton icon="tabler:trash" size="sm" variant="ghost" color="error"
                @click="requestDelete(item)" />
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- ===== 迷你播放条（底部悬浮） ===== -->
    <Transition name="mini-player">
      <div v-if="currentMusic && !playerOpen"
        class="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-[#1f1f26]/95 text-white shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
        style="padding-bottom: env(safe-area-inset-bottom)"
      >
        <div class="mx-auto flex h-16 max-w-6xl items-center gap-3 px-3 sm:gap-4 sm:px-6">
          <button type="button" class="shrink-0 opacity-90 transition hover:opacity-100" :title="$t('dashboard.music.openPlayer')" @click="expandPlayer()">
            <MusicVinyl :spinning="isPlaying" :size="44" :cover="currentMusic.coverUrl" />
          </button>
          <button type="button" class="min-w-0 text-left" @click="expandPlayer()">
            <p class="truncate text-sm font-semibold">{{ currentMusic.title }}</p>
            <p class="truncate text-xs text-white/50">{{ currentMusic.filename }}</p>
          </button>

          <div class="min-w-0 flex-1 hidden sm:block">
            <div class="flex items-center gap-2 text-xs tabular-nums text-white/60">
              <span>{{ formatTime(progress) }}</span>
              <div class="group/bar relative h-1 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/20"
                @click="seekTo($event.offsetX / $event.currentTarget.clientWidth * duration)">
                <div class="absolute inset-y-0 left-0 rounded-full bg-red-500" :style="{ width: `${playPct}%` }" />
              </div>
              <span>{{ formatTime(duration) }}</span>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <button type="button" class="rounded-full p-2 text-white/80 transition hover:text-white" :title="isPlaying ? $t('dashboard.music.nowPlaying') : ''"
              @click="togglePlay(currentMusic)">
              <Icon :name="isPlaying ? 'tabler:player-pause-filled' : 'tabler:player-play-filled'" class="size-7" />
            </button>
            <button type="button" class="rounded-full p-2 text-white/70 transition hover:text-white" @click="stopPlay()">
              <Icon name="tabler:player-stop" class="size-5" />
            </button>
            <button type="button" class="rounded-full p-2 text-white/70 transition hover:text-white"
              :title="$t('dashboard.music.openPlayer')" @click="expandPlayer()">
              <Icon name="tabler:chevron-up" class="size-5" />
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ===== 全屏展开播放器（Apple Music 风格浮层） ===== -->
    <Teleport to="body">
      <Transition name="player-overlay">
        <div v-if="playerOpen && currentMusic"
          class="fixed inset-0 z-[80] flex flex-col bg-[#12080a] text-white"
          style="padding-bottom: env(safe-area-inset-bottom)"
        >
          <!-- 高斯模糊封面氛围背景 -->
          <img
            v-if="currentMusic.coverUrl"
            :src="currentMusic.coverUrl"
            alt=""
            class="pointer-events-none absolute inset-0 h-full w-full object-cover blur-3xl opacity-40"
          />
          <div class="pointer-events-none absolute inset-0 bg-[#0b0506]/70" />
          <div class="pointer-events-none absolute inset-0 opacity-50"
            style="background: radial-gradient(70% 60% at 20% 30%, rgba(214,40,40,0.25), transparent 60%), radial-gradient(60% 50% at 90% 80%, rgba(255,120,90,0.12), transparent 60%)" />

          <!-- 顶部栏 -->
          <div class="relative flex shrink-0 items-center justify-between px-4 py-3">
            <button type="button" class="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              @click="playerOpen = false">
              <Icon name="tabler:chevron-down" class="size-6" />
            </button>
            <p class="truncate text-sm text-white/70">{{ currentMusic.title }}</p>
            <button type="button" class="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white" @click="stopPlay()">
              <Icon name="tabler:x" class="size-5" />
            </button>
          </div>

          <!-- 主体：默认（碟盘 + 歌词） / 歌词专注模式（一行行歌词） -->
          <div class="music-player-body relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col items-center gap-6 overflow-y-auto px-4 py-3 lg:flex-row lg:items-center lg:gap-16 lg:py-4">
            <template v-if="!lyricsMode">
              <!-- 碟盘区：点击碟盘切换为一行行歌词模式 -->
              <div class="relative flex shrink-0 flex-col items-center">
                <div class="relative">
                  <button
                    type="button"
                    class="group relative block cursor-pointer"
                    @click="lyricsMode = true"
                  >
                    <div class="absolute -inset-8 rounded-full bg-red-600/20 blur-3xl" />
                    <MusicVinyl :spinning="isPlaying" :size="'min(240px, 52vw)'" :cover="currentMusic.coverUrl" class="relative" />
                    <!-- 唱针：播放时放下压住唱片 -->
                    <MusicTonearm :playing="isPlaying" :size="'min(240px, 52vw)'" class="pointer-events-none" />
                    <!-- 点击提示 -->
                    <span class="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] tracking-wide text-white/40 transition group-hover:text-white/85">
                      {{ $t('dashboard.music.lyricsModeHint') }}
                    </span>
                  </button>
                  <!-- 设置封面：碟片右下角小按钮 -->
                  <button
                    type="button"
                    class="absolute bottom-2 right-2 z-10 grid size-8 place-items-center rounded-full bg-black/45 text-white/80 shadow-lg backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
                    :title="$t('dashboard.music.setCover')"
                    @click="pickCover(currentMusic)"
                  >
                    <Icon name="tabler:camera" class="size-4" />
                  </button>
                </div>

                <p class="mt-8 max-w-[300px] text-center text-lg font-bold leading-snug">{{ currentMusic.title }}</p>
                <p class="mt-1 text-sm text-white/50">{{ currentMusic.filename }}</p>
              </div>

              <!-- 歌词区（右侧/下方） -->
              <div class="relative flex min-h-[220px] w-full max-w-lg flex-1 flex-col">
                <div v-if="hasLyrics" ref="lyricsScrollRef"
                  class="lyric-scroll relative flex-1 overflow-y-auto py-[35%] [scrollbar-width:none]" style="mask-image:linear-gradient(to bottom, transparent, black 18%, black 82%, transparent);-webkit-mask-image:linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)">
                  <div class="flex flex-col gap-5">
                    <p
                      v-for="(line, i) in lyricsLines"
                      :key="i"
                      class="lyric-line text-center text-[15px] leading-relaxed transition-all duration-300"
                      :class="i === activeLyricIndex
                        ? 'lyric-line-active scale-[1.06] font-bold text-white'
                        : 'text-white/35'"
                    >
                      {{ line.text || '♪' }}
                    </p>
                  </div>
                </div>
                <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 text-white/45">
                  <Icon name="tabler:music-off" class="size-10" />
                  <p class="text-sm">{{ $t('dashboard.music.pureMusic') }}</p>
                  <p class="text-xs">{{ $t('dashboard.music.noLyrics') }}</p>
                </div>
              </div>
            </template>

            <!-- 歌词专注模式：一行行歌词居中展示，点击任意处返回碟盘 -->
            <template v-else>
              <button
                type="button"
                class="group relative mx-auto flex min-h-0 w-full flex-1 cursor-pointer flex-col items-center justify-center"
                @click="lyricsMode = false"
              >
                <div
                  v-if="hasLyrics"
                  ref="lyricsScrollRef"
                  class="lyric-scroll relative max-h-full w-full flex-1 overflow-y-auto py-[38%] [scrollbar-width:none]"
                  style="mask-image:linear-gradient(to bottom, transparent, black 22%, black 78%, transparent);-webkit-mask-image:linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)"
                >
                  <div class="flex flex-col gap-7">
                    <p
                      v-for="(line, i) in lyricsLines"
                      :key="i"
                      class="lyric-line text-center text-xl leading-relaxed transition-all duration-300 sm:text-2xl"
                      :class="i === activeLyricIndex
                        ? 'lyric-line-active scale-105 font-bold text-white'
                        : 'text-white/30'"
                    >
                      {{ line.text || '♪' }}
                    </p>
                  </div>
                </div>
                <div v-else class="flex flex-col items-center justify-center gap-3 text-white/45">
                  <Icon name="tabler:music-off" class="size-12" />
                  <p class="text-base">{{ $t('dashboard.music.pureMusic') }}</p>
                  <p class="text-sm">{{ $t('dashboard.music.noLyrics') }}</p>
                </div>
                <span class="mt-2 text-[11px] tracking-wide text-white/35">{{ $t('dashboard.music.lyricsModeBack') }}</span>
              </button>
            </template>
          </div>

          <!-- 底部控制区 -->
          <div class="relative mx-auto w-full shrink-0 max-w-3xl px-4 pb-7 pt-2">
            <!-- 进度条 -->
            <div class="flex items-center gap-3 text-xs tabular-nums text-white/60">
              <span>{{ formatTime(progress) }}</span>
              <div class="group/bar relative h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/15"
                @click="seekTo($event.offsetX / $event.currentTarget.clientWidth * duration)">
                <div class="absolute inset-y-0 left-0 rounded-full bg-red-500" :style="{ width: `${playPct}%` }" />
                <span class="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-white shadow" :style="{ left: `calc(${playPct}% - 6px)` }" />
              </div>
              <span>{{ formatTime(duration) }}</span>
            </div>

            <!-- 控制按钮 -->
            <div class="mt-3 flex items-center justify-center gap-5">
              <button type="button" class="text-white/50 transition hover:text-white" :title="$t('dashboard.music.seekBack')" @click="seekTo(progress - 10)">
                <Icon name="tabler:rotate-clockwise-2" class="size-6 -scale-x-100" />
              </button>
              <button type="button"
                class="flex size-16 items-center justify-center rounded-full bg-red-500 shadow-lg shadow-red-900/40 transition hover:bg-red-400"
                @click="togglePlay(currentMusic)">
                <Icon :name="isPlaying ? 'tabler:player-pause-filled' : 'tabler:player-play-filled'" class="size-8" />
              </button>
              <button type="button" class="text-white/50 transition hover:text-white" :title="$t('dashboard.music.seekFwd')" @click="seekTo(progress + 10)">
                <Icon name="tabler:rotate-clockwise-2" class="size-6" />
              </button>
              <button type="button" class="text-white/50 transition hover:text-white" @click="stopPlay()">
                <Icon name="tabler:player-stop" class="size-6" />
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 歌词编辑弹窗 -->
    <UModal v-model:open="lyricsEditModal">
      <UCard :ui="{ body: { base: 'space-y-4' } }">
        <template #header>
          <div class="flex items-center gap-2">
            <Icon name="tabler:microphone-2" class="size-5 text-red-500" />
            <h3 class="font-semibold">{{ $t('dashboard.music.editLyrics') }} · {{ lyricsEditTarget?.title }}</h3>
          </div>
        </template>
        <UTextarea v-model="lyricsDraft" :placeholder="$t('dashboard.music.lyricsPlaceholder')" :rows="10" />
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="lyricsEditModal = false">{{ $t('common.cancel') }}</UButton>
            <UButton color="primary" icon="tabler:check" @click="saveLyrics">{{ $t('dashboard.music.lyricsSaved') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 删除确认 -->
    <UModal v-model:open="confirmDelete">
      <UCard :ui="{ body: { base: 'space-y-4' } }">
        <template #header>
          <div class="flex items-center gap-2">
            <Icon name="tabler:trash" class="size-5 text-(--ui-error)" />
            <h3 class="font-semibold">{{ $t('dashboard.music.deleteTitle') }}</h3>
          </div>
        </template>
        <p class="text-sm text-(--ui-text-muted)">
          {{ $t('dashboard.music.deleteConfirm', { title: targetDelete?.title }) }}
        </p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="confirmDelete = false">{{ $t('common.cancel') }}</UButton>
            <UButton color="error" icon="tabler:trash" @click="doDelete">{{ $t('dashboard.music.deleteAction') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* 迷你播放条滑入 */
.mini-player-enter-active,
.mini-player-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.mini-player-enter-from,
.mini-player-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* 全屏播放器淡入 */
.player-overlay-enter-active {
  transition: opacity 0.25s ease;
}
.player-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.player-overlay-enter-from,
.player-overlay-leave-to {
  opacity: 0;
}

.lyric-scroll::-webkit-scrollbar {
  display: none;
}

/* 桌面端（左右并排）播放器主体：垂直居中；内容超高时回退为顶端对齐以便滚动，避免被裁切 */
@media (min-width: 1024px) {
  .music-player-body {
    align-items: safe center;
  }
}
</style>
