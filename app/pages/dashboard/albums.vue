<script lang="ts" setup>
import type { Album, Photo } from '~~/server/utils/db'
import type { FormSubmitEvent, FormError } from '@nuxt/ui'
import { useStorage } from '@vueuse/core'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.albums'),
})

interface AlbumItem extends Album {
  photoCount?: number
  photoIds?: string[]
  coverPhoto?: Photo | null
  // 外部库（扫描库）相簿字段；kind='scan' 时 id 不存在，改用 libId/mount/relPath
  kind?: 'manual' | 'scan'
  libId?: number
  mount?: string
  relPath?: string
  link?: string
  /** 扫描库公开 URL 标识（sha256 短前缀），无自定义 slug 时的 UID/公开链接 */
  urlKey?: string | null
  hasCustom?: boolean
  hasChildren?: boolean
  children?: AlbumItem[]
  external?: boolean
}

interface AlbumFormState {
  title: string
  description: string
  isHidden: boolean
  hideFromGallery: boolean
  slug: string
  password: string
  // 照片展示布局：瀑布流 / 统一网格 / 沉浸式看图 / 时间线
  layout: 'waterfall' | 'grid' | 'immersive' | 'timeline'
}

const albums = ref<AlbumItem[]>([])
// 初始为 true：首次渲染先显示加载态，避免在数据加载完成前误显示「没有相簿」
const isLoadingAlbums = ref(true)
const searchQuery = ref('')
// 视图模式：grid=大型卡片图，medium=中型卡片（比大还小、比列表还大），list=紧凑列表。
// 用 useStorage：SSR 默认 grid，客户端水合后从 localStorage 恢复用户的切换记忆，并在变更时自动持久化。
const viewMode = useStorage<'grid' | 'list' | 'medium'>('albums.viewMode', 'grid')

const filteredAlbums = computed<AlbumItem[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return albums.value
  return albums.value.filter((album) => {
    const haystack = [
      album.title,
      album.description,
      album.slug,
      album.relPath,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
})

const { t, locale } = useI18n()
// 按系统语言取单复数名词：取 key_one / key_few / key_many / key_other
const pluralNoun = (base: string, n: number) => {
  const category = new Intl.PluralRules(locale.value || 'en').select(n)
  return t(`${base}_${category}`)
}
const albumCountWord = computed(() =>
  pluralNoun('dashboard.albums.totalCount', filteredAlbums.value.length),
)
const searchResultWord = computed(() =>
  pluralNoun('dashboard.albums.searchResult', filteredAlbums.value.length),
)
const allPhotos = ref<Photo[]>([])
const isLoadingPhotos = ref(false)

const isAlbumSlideoverOpen = ref(false)
const isDeleteConfirmOpen = ref(false)
const isPhotoSelectorOpen = ref(false)
// 手动重置相簿 UID 的确认弹窗（仅普通相簿）
const isResetUidConfirmOpen = ref(false)
const isResettingUid = ref(false)

const currentAlbum = ref<AlbumItem | null>(null)

const formData = reactive<AlbumFormState>({
  title: '',
  description: '',
  isHidden: false,
  hideFromGallery: false,
  slug: '',
  password: '',
  layout: 'waterfall',
})

// 相簿密码「按钮式开关」：是否开启访问密码（表单态）
const passwordToggle = ref(false)
const hasStoredPassword = computed(() => {
  const album = currentAlbum.value
  return !!album && !!(album as any).passwordProtected
})
// 眼睛开关：明文/密文显示密码输入框内容
const passwordReveal = ref(false)

const showPasswordWarningToast = () => {
  useToast().add({
    title: $t('dashboard.albums.form.passwordSaveError'),
    color: 'danger',
    progress: { color: 'error' },
    duration: 4000,
  })
}

const formRef = ref()
const isSubmittingForm = ref(false)

const selectedPhotoIds = ref<string[]>([])
const coverPhotoId = ref('')

const draftSelectedPhotoIds = ref<string[]>([])
const draftCoverPhotoId = ref('')
const {
  filteredPhotos: unifiedFilteredPhotos,
  selectedCounts,
  hasActiveFilters,
  clearAllFilters,
} = usePhotoFilters()

const isSelectorFilterOpen = ref(false)

const totalSelectedFilters = computed(() => {
  return Object.values(selectedCounts.value).reduce(
    (total, count) => total + count,
    0,
  )
})

const validateForm = (state: any): FormError[] => {
  const errors: FormError[] = []
  if (!state.title?.trim()) {
    errors.push({
      name: 'title',
      message: $t('dashboard.albums.form.titleRequired'),
    })
  }
  return errors
}

const loadAlbums = async () => {
  isLoadingAlbums.value = true
  try {
    const response = await $fetch('/api/albums')
    // 手动相簿用 photoIds 数量；外部库相簿使用其自带 photoCount，避免被重置为 0
    albums.value = (response as any[]).map((album) => ({
      ...album,
      photoCount:
        album.kind === 'scan'
          ? album.photoCount ?? 0
          : album.photoIds?.length || 0,
    }))

    for (const album of albums.value) {
      if (album.coverPhotoId && allPhotos.value.length > 0) {
        const coverPhoto = allPhotos.value.find(
          (p) => p.id === album.coverPhotoId,
        )
        if (coverPhoto) {
          album.coverPhoto = coverPhoto
        }
      }
    }
  } catch (error) {
    console.error('Failed to load albums:', error)
    useToast().add({
      title: $t('dashboard.albums.messages.loadError'),
      color: 'error',
    })
  } finally {
    isLoadingAlbums.value = false
  }
}

const loadPhotos = async () => {
  isLoadingPhotos.value = true
  try {
    const { photos } = usePhotos()
    allPhotos.value = photos.value
  } catch (error) {
    console.error('Failed to load photos:', error)
  } finally {
    isLoadingPhotos.value = false
  }
}

const openCreateSlideover = () => {
  currentAlbum.value = null
  formData.title = ''
  formData.description = ''
  formData.isHidden = false
  formData.hideFromGallery = false
  formData.slug = ''
  formData.password = ''
  formData.layout = 'waterfall'
  passwordToggle.value = false
  selectedPhotoIds.value = []
  coverPhotoId.value = ''
  formRef.value?.clear()
  isAlbumSlideoverOpen.value = true
}

// —— 外部库（扫描库）相簿支持 ——

const isScanAlbum = (album: AlbumItem | null | undefined) =>
  album?.kind === 'scan'

// 展开态集合：key = `${libId}:${relPath}`
const expandedScanAlbums = ref<Set<string>>(new Set())

const scanKey = (album: AlbumItem) =>
  `${album.libId}:${album.relPath ?? ''}`

const toggleExpandScan = (album: AlbumItem) => {
  const key = scanKey(album)
  const next = new Set(expandedScanAlbums.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedScanAlbums.value = next
}

const isScanExpanded = (album: AlbumItem) =>
  expandedScanAlbums.value.has(scanKey(album))

const openEditSlideover = async (album: AlbumItem) => {
  currentAlbum.value = album
  formData.slug = ''
  passwordReveal.value = false

  // 外部库相簿：不从 albums 表加载详情，直接使用列表节点携带的元数据
  if (isScanAlbum(album)) {
    formData.title = album.title
    formData.description = album.description || ''
    formData.isHidden = album.isHidden || false
    formData.hideFromGallery = (album as any).hideFromGallery || false
    formData.slug = album.slug || ''
    formData.password = (album as any).password || ''
    formData.layout =
      (album as any).layout === 'grid' ||
      (album as any).layout === 'immersive' ||
      (album as any).layout === 'timeline'
        ? (album as any).layout
        : 'waterfall'
    passwordToggle.value = !!(album as any).passwordProtected
    coverPhotoId.value = album.coverPhotoId || ''
    selectedPhotoIds.value = []
    formRef.value?.clear()
    isAlbumSlideoverOpen.value = true
    return
  }

  try {
    const albumDetail = (await $fetch(`/api/albums/${album.id}?manage=1`)) as any
    formData.title = album.title
    formData.description = album.description || ''
    formData.isHidden = album.isHidden || false
    formData.slug = album.slug || ''
    selectedPhotoIds.value = (albumDetail.photos || []).map((p: Photo) => p.id)
    coverPhotoId.value = album.coverPhotoId || ''
    // 明文密码在管理端回填，可在输入框内用眼睛查看/编辑
    formData.password = albumDetail.password || ''
    formData.layout =
      albumDetail.layout === 'grid' ||
      albumDetail.layout === 'immersive' ||
      albumDetail.layout === 'timeline'
        ? albumDetail.layout
        : 'waterfall'
    passwordToggle.value = !!albumDetail.passwordProtected
    formRef.value?.clear()
  } catch (error) {
    console.error('Failed to load album details:', error)
    useToast().add({
      title: $t('dashboard.albums.messages.loadDetailError'),
      color: 'error',
    })
  }
  isAlbumSlideoverOpen.value = true
}

const scanAlbumUid = computed(() => {
  const album = currentAlbum.value
  if (!album || !isScanAlbum(album)) return ''
  // 优先自定义 slug；否则用公开 urlKey（sha256 短前缀）；两者皆无才回退内部数字 id
  return album.slug && album.slug.trim()
    ? String(album.slug.trim())
    : album.urlKey || `scan:${album.libId}${album.relPath ? ':' + album.relPath : ''}`
})

const scanAlbumPublicUrl = computed(() => {
  const album = currentAlbum.value
  if (!album || !isScanAlbum(album)) return ''
  // 公开访问路径：设了自定义 slug 用 /albums/s/{slug}，否则用 /albums/scan/{urlKey}
  if (formData.slug && formData.slug.trim()) {
    return `/albums/s/${encodeURIComponent(formData.slug.trim())}`
  }
  if (album.urlKey) return `/albums/scan/${album.urlKey}`
  return ''
})

// 普通相簿（手动相册）的 UID 与公开链接：使用不透明 uid；设了自定义别名则走 slug
const manualAlbumUid = computed(() => {
  const album = currentAlbum.value
  return album && !isScanAlbum(album)
    ? album.uid || String(album.id)
    : ''
})
const manualAlbumPublicUrl = computed(() => {
  const album = currentAlbum.value
  if (!album || isScanAlbum(album)) return ''
  if (formData.slug?.trim()) {
    return `/albums/s/${encodeURIComponent(formData.slug.trim())}`
  }
  return album.uid ? `/albums/${album.uid}` : `/albums/${album.id}`
})

// 统一的「相簿 UID」与「公开链接」：普通相簿 / 外部库相簿共用同一套只读字段
const albumUid = computed(() =>
  isScanAlbum(currentAlbum.value)
    ? scanAlbumUid.value
    : manualAlbumUid.value,
)
const albumPublicUrl = computed(() =>
  isScanAlbum(currentAlbum.value)
    ? scanAlbumPublicUrl.value
    : manualAlbumPublicUrl.value,
)

const copyPublicUrl = async () => {
  const url = albumPublicUrl.value
  if (!url) return
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${url}`)
    useToast().add({
      title: $t('dashboard.albums.form.copied'),
      color: 'success',
    })
  } catch {
    /* 忽略剪贴板权限异常 */
  }
}

// 手动重置相簿 UID：普通相簿重置 uid，外部库相簿重置其独立 urlKey；
// 重置后旧公开链接失效，返回新标识并更新当前展示
const confirmResetUid = async () => {
  const album = currentAlbum.value
  if (!album) return
  isResettingUid.value = true
  try {
    if (isScanAlbum(album)) {
      const updated = await $fetch('/api/albums/scan-reset-uid', {
        method: 'POST',
        body: { libId: album.libId, path: album.relPath || '' },
      }) as any
      if (currentAlbum.value) {
        currentAlbum.value.urlKey = updated?.urlKey
      }
    } else {
      const updated = await $fetch(`/api/albums/${album.id}/reset-uid`, {
        method: 'POST',
      }) as any
      if (currentAlbum.value) {
        currentAlbum.value.uid = updated?.uid
      }
    }
    useToast().add({
      title: $t('dashboard.albums.form.uidResetSuccess'),
      color: 'success',
    })
    await loadAlbums()
  } catch (error) {
    console.error('Failed to reset album uid:', error)
    useToast().add({
      title: $t('dashboard.albums.form.uidResetError'),
      color: 'error',
    })
  } finally {
    isResettingUid.value = false
    isResetUidConfirmOpen.value = false
  }
}

const openDeleteConfirm = (album: AlbumItem) => {
  currentAlbum.value = album
  isDeleteConfirmOpen.value = true
}

// 删除确认弹窗：外部库相簿=清除自定义配置；手动相册=删除相册
const isResetScanConfirm = computed(
  () => isScanAlbum(currentAlbum.value),
)

const confirmDestructive = () => {
  if (isResetScanConfirm.value && currentAlbum.value) {
    void resetScanAlbumMeta(currentAlbum.value)
  } else {
    void deleteAlbum()
  }
}

const onFormSubmit = async (event: FormSubmitEvent<AlbumFormState>) => {
  isSubmittingForm.value = true
  const newPassword = event.data.password?.trim() || ''
  // 打开了访问密码开关、但未输入任何密码时：禁止保存，弹出系统失败提示
  if (passwordToggle.value && !newPassword && !hasStoredPassword.value) {
    isSubmittingForm.value = false
    showPasswordWarningToast()
    return
  }
  // 依据「按钮式开关」推导密码载荷：
  // - 关闭开关 → 清除已设定的密码；
  // - 开关开启 → 输入了新密码则更新；未输入且原本已有密码则保持不变（无密码被校验拦截）。
  const passwordPayload = passwordToggle.value
    ? newPassword
      ? { password: newPassword, clearPassword: false }
      : { password: undefined, clearPassword: false }
    : { password: undefined, clearPassword: true }
  try {
    if (currentAlbum.value && isScanAlbum(currentAlbum.value)) {
      // 外部库相簿：保存到扫描相簿元数据
      const scan = currentAlbum.value
      const body: Record<string, unknown> = {
        libId: scan.libId,
        path: scan.relPath ?? '',
        title: event.data.title,
        description: event.data.description || null,
        coverPhotoId: coverPhotoId.value || null,
        isHidden: event.data.isHidden,
        layout: event.data.layout,
        ...passwordPayload,
        slug: event.data.slug?.trim() || null,
      }
      await $fetch('/api/albums/scan-meta', { method: 'PUT', body })

      useToast().add({
        title: $t('dashboard.albums.messages.updateSuccess'),
        color: 'success',
      })
      isAlbumSlideoverOpen.value = false
    } else if (currentAlbum.value) {
      await $fetch(`/api/albums/${currentAlbum.value.id}`, {
        method: 'PUT',
        body: {
          title: event.data.title,
          description: event.data.description || undefined,
          coverPhotoId: coverPhotoId.value || undefined,
          photoIds: selectedPhotoIds.value,
          isHidden: event.data.isHidden,
          hideFromGallery: event.data.hideFromGallery,
          layout: event.data.layout,
          ...passwordPayload,
          slug: event.data.slug?.trim() || null,
        },
      })

      useToast().add({
        title: $t('dashboard.albums.messages.updateSuccess'),
        color: 'success',
      })

      isAlbumSlideoverOpen.value = false
    } else {
      await $fetch('/api/albums', {
        method: 'POST',
        body: {
          title: event.data.title,
          description: event.data.description || undefined,
          coverPhotoId: coverPhotoId.value || undefined,
          photoIds: selectedPhotoIds.value,
          isHidden: event.data.isHidden,
          hideFromGallery: event.data.hideFromGallery,
          layout: event.data.layout,
          password: passwordToggle.value ? newPassword || undefined : undefined,
          slug: event.data.slug?.trim() || null,
        },
      })

      useToast().add({
        title: $t('dashboard.albums.messages.createSuccess'),
        color: 'success',
      })

      isAlbumSlideoverOpen.value = false
    }

    await loadAlbums()
  } catch (error) {
    console.error('Failed to save album:', error)
    useToast().add({
      title: currentAlbum.value
        ? $t('dashboard.albums.messages.updateError')
        : $t('dashboard.albums.messages.createError'),
      color: 'error',
    })
  } finally {
    isSubmittingForm.value = false
  }
}

// 外部库相簿：清除其自定义元数据（还原为默认推导值）
const resetScanAlbumMeta = async (album: AlbumItem) => {
  isSubmittingForm.value = true
  try {
    await $fetch('/api/albums/scan-meta', {
      method: 'PUT',
      body: { libId: album.libId, path: album.relPath ?? '', clear: true },
    })
    useToast().add({
      title: $t('dashboard.albums.messages.resetSuccess'),
      color: 'success',
    })
    isDeleteConfirmOpen.value = false
    await loadAlbums()
  } catch (error) {
    console.error('Failed to reset scan album:', error)
    useToast().add({
      title: $t('dashboard.albums.messages.resetError'),
      color: 'error',
    })
  } finally {
    isSubmittingForm.value = false
  }
}

const deleteAlbum = async () => {
  if (!currentAlbum.value) return

  try {
    await $fetch(`/api/albums/${currentAlbum.value.id}`, {
      method: 'DELETE',
    })

    useToast().add({
      title: $t('dashboard.albums.messages.deleteSuccess'),
      color: 'success',
    })

    isDeleteConfirmOpen.value = false
    await loadAlbums()
  } catch (error) {
    console.error('Failed to delete album:', error)
    useToast().add({
      title: $t('dashboard.albums.messages.deleteError'),
      color: 'error',
    })
  }
}

const togglePhotoSelection = (photoId: string) => {
  const index = selectedPhotoIds.value.indexOf(photoId)
  if (index > -1) {
    selectedPhotoIds.value.splice(index, 1)
    if (coverPhotoId.value === photoId) {
      coverPhotoId.value = ''
    }
  } else {
    selectedPhotoIds.value.push(photoId)
  }
}

const openPhotoSelector = () => {
  draftSelectedPhotoIds.value = [...selectedPhotoIds.value]
  draftCoverPhotoId.value =
    coverPhotoId.value && selectedPhotoIds.value.includes(coverPhotoId.value)
      ? coverPhotoId.value
      : ''
  isSelectorFilterOpen.value = false
  isPhotoSelectorOpen.value = true
}

const closePhotoSelector = () => {
  isSelectorFilterOpen.value = false
  isPhotoSelectorOpen.value = false
}

const confirmPhotoSelection = () => {
  selectedPhotoIds.value = [...draftSelectedPhotoIds.value]
  coverPhotoId.value = draftSelectedPhotoIds.value.includes(
    draftCoverPhotoId.value,
  )
    ? draftCoverPhotoId.value
    : ''
  isPhotoSelectorOpen.value = false
}

const toggleDraftPhotoSelection = (photoId: string) => {
  const index = draftSelectedPhotoIds.value.indexOf(photoId)
  if (index > -1) {
    draftSelectedPhotoIds.value.splice(index, 1)
    if (draftCoverPhotoId.value === photoId) {
      draftCoverPhotoId.value = ''
    }
    return
  }

  draftSelectedPhotoIds.value.push(photoId)
}

const setDraftCoverPhoto = (photoId: string) => {
  if (!draftSelectedPhotoIds.value.includes(photoId)) {
    draftSelectedPhotoIds.value.push(photoId)
  }
  draftCoverPhotoId.value = photoId
}

const getDraftPhotoOrder = (photoId: string) => {
  const index = draftSelectedPhotoIds.value.indexOf(photoId)
  return index >= 0 ? index + 1 : null
}

const areAllFilteredPhotosSelected = computed(() => {
  return (
    selectorFilteredPhotos.value.length > 0 &&
    selectorFilteredPhotos.value.every((photo) =>
      draftSelectedPhotoIds.value.includes(photo.id),
    )
  )
})

const areSomeFilteredPhotosSelected = computed(() => {
  const selectedInFiltered = selectorFilteredPhotos.value.filter((photo) =>
    draftSelectedPhotoIds.value.includes(photo.id),
  ).length
  return (
    selectedInFiltered > 0 &&
    selectedInFiltered < selectorFilteredPhotos.value.length
  )
})

const toggleAllFilteredPhotos = () => {
  if (areAllFilteredPhotosSelected.value) {
    draftSelectedPhotoIds.value = draftSelectedPhotoIds.value.filter(
      (id) => !selectorFilteredPhotos.value.some((photo) => photo.id === id),
    )
    if (
      draftCoverPhotoId.value &&
      !draftSelectedPhotoIds.value.includes(draftCoverPhotoId.value)
    ) {
      draftCoverPhotoId.value = ''
    }
    return
  }

  const merged = new Set(draftSelectedPhotoIds.value)
  for (const photo of selectorFilteredPhotos.value) {
    merged.add(photo.id)
  }
  draftSelectedPhotoIds.value = [...merged]
}

const selectorFilteredPhotos = computed(() => {
  if (allPhotos.value.length === 0) return []

  const ids = new Set(allPhotos.value.map((photo) => photo.id))
  return unifiedFilteredPhotos.value.filter((photo) => ids.has(photo.id))
})

const selectedPhotosPreview = computed(() => {
  return draftSelectedPhotoIds.value
    .map((id) => allPhotos.value.find((photo) => photo.id === id))
    .filter((photo): photo is Photo => Boolean(photo))
    .slice(0, 8)
})

const selectedPhotosOverflowCount = computed(() => {
  return Math.max(
    draftSelectedPhotoIds.value.length - selectedPhotosPreview.value.length,
    0,
  )
})

onMounted(async () => {
  await Promise.all([loadPhotos(), loadAlbums()])
})

const dayjs = useDayjs()

const slideoverTitle = computed(() => {
  return currentAlbum.value
    ? $t('dashboard.albums.slideover.edit.title')
    : $t('dashboard.albums.slideover.create.title')
})

const slideoverDescription = computed(() => {
  return currentAlbum.value
    ? $t('dashboard.albums.slideover.edit.description')
    : $t('dashboard.albums.slideover.create.description')
})

const submitButtonLabel = computed(() => {
  return currentAlbum.value
    ? $t('dashboard.albums.slideover.submitEdit')
    : $t('dashboard.albums.slideover.submitCreate')
})

// —— 卡片网格辅助 ——

const albumKey = (album: AlbumItem) =>
  isScanAlbum(album)
    ? `scan:${album.libId}:${album.relPath ?? ''}`
    : `manual:${album.id}`

const openAlbum = (album: AlbumItem) => {
  let link: string
  if (isScanAlbum(album)) {
    link = album.link || `/albums/scan/${album.libId}`
  } else if (album.slug) {
    link = `/albums/s/${encodeURIComponent(album.slug)}`
  } else {
    link = `/albums/${album.uid ?? album.id}`
  }
  window.open(link, '_blank', 'noopener')
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.albums')">
        <template #right>
          <UButton
            icon="tabler:plus"
            color="primary"
            @click="openCreateSlideover"
          >
            {{ $t('dashboard.albums.createButton') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-6">
        <!-- 页面标题、搜索与统计 -->
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-(--ui-text)">
                {{ $t('dashboard.albums.title') }}
              </h2>
              <p class="mt-0.5 text-sm text-(--ui-text-muted)">
                {{ $t('dashboard.albums.subtitle') }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UInput
                v-model="searchQuery"
                icon="tabler:search"
                class="w-40 sm:w-52"
                :placeholder="$t('dashboard.albums.searchPlaceholder')"
              />
              <UButtonGroup size="sm">
                <UButton
                  :color="viewMode === 'grid' ? 'primary' : 'neutral'"
                  :variant="viewMode === 'grid' ? 'solid' : 'soft'"
                  icon="tabler:layout-grid"
                  :aria-label="$t('dashboard.albums.viewGrid')"
                  :title="$t('dashboard.albums.viewGrid')"
                  @click="viewMode = 'grid'"
                />
                <UButton
                  :color="viewMode === 'medium' ? 'primary' : 'neutral'"
                  :variant="viewMode === 'medium' ? 'solid' : 'soft'"
                  icon="tabler:layout-cards"
                  :aria-label="$t('dashboard.albums.viewMedium')"
                  :title="$t('dashboard.albums.viewMedium')"
                  @click="viewMode = 'medium'"
                />
                <UButton
                  :color="viewMode === 'list' ? 'primary' : 'neutral'"
                  :variant="viewMode === 'list' ? 'solid' : 'soft'"
                  icon="tabler:list"
                  :aria-label="$t('dashboard.albums.viewList')"
                  :title="$t('dashboard.albums.viewList')"
                  @click="viewMode = 'list'"
                />
              </UButtonGroup>
            </div>
          </div>

          <div class="flex items-center gap-1.5 text-xs text-(--ui-text-muted)">
            <Icon name="tabler:album" size="15" />
            <span v-if="searchQuery.trim()" class="tabular-nums">
              <span class="font-semibold text-(--ui-text)">{{
                filteredAlbums.length
              }}</span>
              {{ searchResultWord }}
            </span>
            <span v-else class="tabular-nums">
              <span class="font-semibold text-(--ui-text)">{{
                filteredAlbums.length
              }}</span>
              {{ albumCountWord }}
            </span>
          </div>
        </div>

        <!-- 相簿列表（网格 / 紧凑列表） -->
        <div v-if="filteredAlbums.length > 0" class="mb-2 pb-2 sm:mb-0 sm:pb-6">
          <!-- 网格：卡片视图 -->
          <div
            v-if="viewMode === 'grid'"
            class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-5"
          >
          <template v-for="album in filteredAlbums" :key="albumKey(album)">
            <div class="min-w-0 flex flex-col">
              <AlbumCard
                :album="album"
                :expanded="isScanAlbum(album) && isScanExpanded(album)"
                size="md"
                @expand="toggleExpandScan(album)"
                @edit="openEditSlideover(album)"
                @reset="openDeleteConfirm(album)"
                @delete="openDeleteConfirm(album)"
                @view="openAlbum(album)"
              />

              <div
                v-if="isScanAlbum(album) && isScanExpanded(album) && album.children?.length"
                class="ml-1.5 mt-2 space-y-1.5 border-l-2 border-primary-400/40 pl-3"
              >
                <AlbumCard
                  v-for="child in album.children"
                  :key="scanKey(child)"
                  :album="child"
                  size="sm"
                  @edit="openEditSlideover(child)"
                  @reset="openDeleteConfirm(child)"
                  @delete="openDeleteConfirm(child)"
                  @view="openAlbum(child)"
                />
              </div>
            </div>
          </template>
          </div>

          <!-- 中型网格：以大型卡片为参考，卡片更紧凑（sm 尺寸），比大还小、比列表还大。
               移动端（<lg）维持 grid-cols-2；桌面端比大视图多一档列数以让卡片更小 -->
          <div
            v-else-if="viewMode === 'medium'"
            class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6"
          >
          <template v-for="album in filteredAlbums" :key="albumKey(album)">
            <div class="min-w-0 flex flex-col">
              <AlbumCard
                :album="album"
                :expanded="isScanAlbum(album) && isScanExpanded(album)"
                size="card"
                @expand="toggleExpandScan(album)"
                @edit="openEditSlideover(album)"
                @reset="openDeleteConfirm(album)"
                @delete="openDeleteConfirm(album)"
                @view="openAlbum(album)"
              />

              <div
                v-if="isScanAlbum(album) && isScanExpanded(album) && album.children?.length"
                class="ml-1.5 mt-1.5 space-y-1.5 border-l-2 border-primary-400/40 pl-3"
              >
                <AlbumCard
                  v-for="child in album.children"
                  :key="scanKey(child)"
                  :album="child"
                  size="sm"
                  @edit="openEditSlideover(child)"
                  @reset="openDeleteConfirm(child)"
                  @delete="openDeleteConfirm(child)"
                  @view="openAlbum(child)"
                />
              </div>
            </div>
          </template>
          </div>

          <!-- 紧凑列表：相簿较多时的省空间视图 -->
          <div v-else class="flex flex-col gap-2">
            <div
              v-for="album in filteredAlbums"
              :key="albumKey(album)"
              class="min-w-0"
            >
              <AlbumCard
                :album="album"
                :expanded="isScanAlbum(album) && isScanExpanded(album)"
                size="row"
                @expand="toggleExpandScan(album)"
                @edit="openEditSlideover(album)"
                @reset="openDeleteConfirm(album)"
                @delete="openDeleteConfirm(album)"
                @view="openAlbum(album)"
              />

              <div
                v-if="isScanAlbum(album) && isScanExpanded(album) && album.children?.length"
                class="ml-9 mt-1.5 space-y-1.5"
              >
                <AlbumCard
                  v-for="child in album.children"
                  :key="scanKey(child)"
                  :album="child"
                  size="sm"
                  @edit="openEditSlideover(child)"
                  @reset="openDeleteConfirm(child)"
                  @delete="openDeleteConfirm(child)"
                  @view="openAlbum(child)"
                />
              </div>
            </div>
          </div>
          </div>

        <div
          v-else-if="albums.length > 0 && searchQuery.trim()"
          class="flex flex-col items-center justify-center py-12 text-center"
        >
          <Icon
            name="tabler:search-off"
            size="48"
            class="text-gray-400 dark:text-gray-600 mb-4"
          />
          <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {{ $t('dashboard.albums.searchEmpty') }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {{
              $t('dashboard.albums.searchEmptyTip', {
                keyword: searchQuery.trim(),
              })
            }}
          </p>
          <UButton
            variant="soft"
            color="neutral"
            class="mt-4"
            @click="searchQuery = ''"
          >
            {{ $t('dashboard.albums.searchClear') }}
          </UButton>
        </div>

        <div
          v-else-if="!isLoadingAlbums"
          class="flex flex-col items-center justify-center py-12 text-center"
        >
          <Icon
            name="tabler:album"
            size="48"
            class="text-gray-400 dark:text-gray-600 mb-4"
          />
          <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {{ $t('dashboard.albums.noAlbums') }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-4">
            {{ $t('dashboard.albums.noAlbumsTip') }}
          </p>
          <UButton
            icon="tabler:plus"
            @click="openCreateSlideover"
          >
            {{ $t('dashboard.albums.createButton') }}
          </UButton>
        </div>
        <div
          v-else
          class="flex items-center justify-center py-12"
        >
          <Icon
            name="tabler:loader"
            size="32"
            class="animate-spin text-primary-500"
          />
        </div>

        <USlideover
          v-model:open="isAlbumSlideoverOpen"
          :title="slideoverTitle"
          :description="slideoverDescription"
          :ui="{ footer: 'justify-end', body: 'p-0 sm:p-0 space-y-4' }"
        >
          <template #body>
            <div
              v-if="coverPhotoId"
              class="relative w-full aspect-video bg-gray-100 dark:bg-neutral-800 overflow-hidden"
            >
              <ThumbImage
                :src="
                  allPhotos.find((p) => p.id === coverPhotoId)?.thumbnailUrl ||
                  ''
                "
                :alt="coverPhotoId"
                class="absolute inset-0 w-full h-full object-cover"
              />
              <button
                class="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"
                @click="coverPhotoId = ''"
              >
                <Icon
                  name="tabler:x"
                  class="text-white"
                />
              </button>
            </div>
            <button
              v-else
              class="w-full h-48 bg-gray-100 dark:bg-neutral-800 flex flex-col items-center justify-center text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
              @click="openPhotoSelector"
            >
              <Icon
                name="tabler:photo"
                size="40"
                class="mb-2"
              />
              <p class="text-sm font-medium">
                {{ $t('dashboard.albums.form.addCoverPhoto') }}
              </p>
            </button>
            <div class="space-y-4 px-4">
              <UForm
                ref="formRef"
                :state="formData"
                :validate="validateForm"
                class="space-y-0"
                @submit="onFormSubmit"
              >
                <!-- 分区：基本信息 -->
                <section class="space-y-4">
                  <header class="flex items-center gap-2 pt-1">
                    <p class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                      {{ $t('dashboard.albums.form.groupInfo') }}
                    </p>
                    <span class="h-px flex-1 bg-neutral-100 dark:bg-neutral-800" />
                  </header>
                  <UFormField
                    :label="$t('dashboard.albums.form.title')"
                    name="title"
                    required
                  >
                    <UInput
                      v-model="formData.title"
                      class="w-full"
                      :placeholder="$t('dashboard.albums.form.titlePlaceholder')"
                    />
                  </UFormField>

                  <UFormField
                    :label="$t('dashboard.albums.form.description')"
                    name="description"
                  >
                    <UTextarea
                      v-model="formData.description"
                      class="w-full"
                      :placeholder="
                        $t('dashboard.albums.form.descriptionPlaceholder')
                      "
                      :rows="3"
                    />
                  </UFormField>
                </section>

                <!-- 分区：公开访问 -->
                <div class="my-5 h-px bg-neutral-100 dark:bg-neutral-800" />
                <section class="space-y-4">
                  <header class="flex items-center gap-2 pt-1">
                    <p class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                      {{ $t('dashboard.albums.form.groupPublic') }}
                    </p>
                    <span class="h-px flex-1 bg-neutral-100 dark:bg-neutral-800" />
                  </header>

                  <div
                    v-if="currentAlbum"
                    class="grid grid-cols-1 gap-3 sm:grid-cols-2"
                  >
                    <UFormField
                      :label="$t('dashboard.albums.form.albumUidLabel')"
                      name="albumUid"
                    >
                      <div class="flex w-full items-center gap-2">
                        <div
                          class="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                        >
                          <Icon name="tabler:hash" class="size-4 shrink-0 text-gray-400" />
                          <code class="truncate font-mono text-gray-700 dark:text-gray-200">
                            {{ albumUid }}
                          </code>
                        </div>
                        <UTooltip
                          :text="$t('dashboard.albums.form.resetUid')"
                        >
                          <UButton
                            icon="tabler:refresh"
                            size="sm"
                            color="danger"
                            variant="soft"
                            :loading="isResettingUid"
                            @click="isResetUidConfirmOpen = true"
                          />
                        </UTooltip>
                      </div>
                    </UFormField>

                    <UFormField
                      :label="$t('dashboard.albums.form.publicLinkLabel')"
                      name="publicLink"
                    >
                      <div class="flex w-full items-center gap-2">
                        <div
                          class="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                        >
                          <Icon name="tabler:link" class="size-4 shrink-0 text-gray-400" />
                          <span v-if="albumPublicUrl" class="truncate text-primary-500 dark:text-primary-400">
                            {{ albumPublicUrl }}
                          </span>
                          <span v-else class="truncate text-neutral-400 dark:text-neutral-500">
                            {{ $t('dashboard.albums.form.publicLinkFallback') }}
                          </span>
                        </div>
                        <UTooltip :text="$t('dashboard.albums.form.copyLink')">
                          <UButton
                            icon="tabler:copy"
                            size="sm"
                            color="neutral"
                            variant="soft"
                            :disabled="!albumPublicUrl"
                            @click="copyPublicUrl"
                          />
                        </UTooltip>
                      </div>
                    </UFormField>
                  </div>

                  <UFormField
                    :label="$t('dashboard.albums.form.customUrl')"
                    name="slug"
                    :help="$t('dashboard.albums.form.customUrlHint')"
                  >
                    <UInput
                      v-model="formData.slug"
                      class="w-full"
                      :placeholder="$t('dashboard.albums.form.customUrlPlaceholder')"
                    />
                  </UFormField>
                </section>

                <!-- 分区：展示样式 -->
                <div class="my-5 h-px bg-neutral-100 dark:bg-neutral-800" />
                <section class="space-y-3">
                  <header class="flex items-center gap-2 pt-1">
                    <p class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                      {{ $t('dashboard.albums.form.groupLayout') }}
                    </p>
                    <span class="h-px flex-1 bg-neutral-100 dark:bg-neutral-800" />
                  </header>

                  <div class="grid grid-cols-2 gap-3 lg:grid-cols-2 xl:grid-cols-4">
                    <button
                      v-for="opt in [
                        {
                          value: 'waterfall',
                          label: $t('dashboard.albums.form.layoutWaterfall'),
                          desc: $t('dashboard.albums.form.layoutWaterfallDesc'),
                          icon: 'tabler:layout-collage',
                        },
                        {
                          value: 'grid',
                          label: $t('dashboard.albums.form.layoutGrid'),
                          desc: $t('dashboard.albums.form.layoutGridDesc'),
                          icon: 'tabler:layout-grid',
                        },
                        {
                          value: 'immersive',
                          label: $t('dashboard.albums.form.layoutImmersive'),
                          desc: $t('dashboard.albums.form.layoutImmersiveDesc'),
                          icon: 'tabler:photo',
                        },
                        {
                          value: 'timeline',
                          label: $t('dashboard.albums.form.layoutTimeline'),
                          desc: $t('dashboard.albums.form.layoutTimelineDesc'),
                          icon: 'tabler:timeline',
                        },
                      ]"
                      :key="opt.value"
                      type="button"
                      class="cursor-pointer rounded-xl border p-3 text-left transition-all"
                      :class="
                        formData.layout === opt.value
                          ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-400 dark:border-primary-500 dark:bg-primary-500/10'
                          : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'
                      "
                      @click="formData.layout = opt.value as 'waterfall' | 'grid' | 'immersive' | 'timeline'"
                    >
                      <Icon
                        :name="opt.icon"
                        class="mb-2 size-5"
                        :class="
                          formData.layout === opt.value
                            ? 'text-primary-600 dark:text-primary-400'
                            : 'text-neutral-400'
                        "
                      />
                      <p
                        class="text-sm font-medium"
                        :class="
                          formData.layout === opt.value
                            ? 'text-primary-700 dark:text-primary-300'
                            : 'text-neutral-800 dark:text-neutral-200'
                        "
                      >
                        {{ opt.label }}
                      </p>
                      <p class="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                        {{ opt.desc }}
                      </p>
                    </button>
                  </div>
                  <p class="text-xs text-neutral-500 dark:text-neutral-400">
                    {{ $t('dashboard.albums.form.layoutHint') }}
                  </p>
                </section>

                <!-- 分区：访问控制 -->
                <div class="my-5 h-px bg-neutral-100 dark:bg-neutral-800" />
                <section class="space-y-4">
                  <header class="flex items-center gap-2 pt-1">
                    <p class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                      {{ $t('dashboard.albums.form.groupSecurity') }}
                    </p>
                    <span class="h-px flex-1 bg-neutral-100 dark:bg-neutral-800" />
                  </header>

                  <!-- 相簿密码：按钮式开关 -->
                  <UFormField name="password">
                    <div class="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/40">
                      <div class="flex items-center justify-between gap-4 px-4 py-3">
                        <div class="min-w-0 space-y-0.5">
                          <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {{ $t('dashboard.albums.form.password') }}
                          </p>
                          <p v-if="!passwordToggle" class="text-xs text-neutral-500 dark:text-neutral-400">
                            {{ $t('dashboard.albums.form.passwordNotSet') }}
                          </p>
                        </div>
                        <USwitch
                          :model-value="passwordToggle"
                          color="info"
                          @update:model-value="passwordToggle = $event"
                        />
                      </div>
                      <div v-if="passwordToggle" class="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
                        <UInput
                          v-model="formData.password"
                          class="w-full"
                          :type="passwordReveal ? 'text' : 'password'"
                          autocomplete="new-password"
                          :placeholder="
                            hasStoredPassword
                              ? $t('dashboard.albums.form.passwordPlaceholderSet')
                              : $t('dashboard.albums.form.passwordPlaceholder')
                          "
                        >
                          <template #trailing>
                            <UButton
                              variant="ghost"
                              color="neutral"
                              square
                              :icon="passwordReveal ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                              :aria-label="$t('dashboard.albums.form.passwordReveal')"
                              @click="passwordReveal = !passwordReveal"
                            />
                          </template>
                        </UInput>
                      </div>
                    </div>
                  </UFormField>

                  <!-- 隐藏相簿：按钮式开关 -->
                  <div class="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50/50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/40">
                    <div class="min-w-0 space-y-0.5">
                      <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {{ $t('dashboard.albums.form.isHidden') }}
                      </p>
                      <p class="text-xs text-neutral-500 dark:text-neutral-400">
                        {{ $t('dashboard.albums.form.isHiddenHint') }}
                      </p>
                    </div>
                    <USwitch v-model="formData.isHidden" color="info" />
                  </div>

                  <!-- 首页照片画廊隐藏：按钮式开关 -->
                  <div
                    v-if="!currentAlbum || !isScanAlbum(currentAlbum)"
                    class="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50/50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/40"
                  >
                    <div class="min-w-0 space-y-0.5">
                      <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {{ $t('dashboard.albums.form.hideFromGallery') }}
                      </p>
                      <p class="text-xs text-neutral-500 dark:text-neutral-400">
                        {{ $t('dashboard.albums.form.hideFromGalleryHint') }}
                      </p>
                    </div>
                    <USwitch v-model="formData.hideFromGallery" color="info" />
                  </div>
                </section>
              </UForm>

              <!-- 照片选择部分（仅手动相册） -->
              <div v-if="!isScanAlbum(currentAlbum)" class="space-y-3">
                <header class="flex items-center gap-2 pt-1">
                  <p class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                    {{ $t('dashboard.albums.form.groupPhotos') }}
                  </p>
                  <span class="h-px flex-1 bg-neutral-100 dark:bg-neutral-800" />
                </header>
                <UButton
                  variant="outline"
                  color="primary"
                  icon="tabler:photo-plus"
                  size="lg"
                  class="w-full"
                  @click="openPhotoSelector"
                >
                  {{
                    selectedPhotoIds.length > 0
                      ? $t('dashboard.albums.form.editPhotos')
                      : $t('dashboard.albums.form.selectPhotos')
                  }}
                </UButton>

                <div
                  v-if="selectedPhotoIds.length > 0"
                  class="space-y-2"
                >
                  <div class="flex items-center justify-between">
                    <label
                      class="text-sm font-medium text-gray-700 dark:text-gray-300"
                      >{{
                        $t('dashboard.albums.form.selectedCount', {
                          count: selectedPhotoIds.length,
                        })
                      }}</label
                    >
                    <UButton
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      icon="tabler:trash"
                      @click="selectedPhotoIds = []"
                    >
                      {{ $t('dashboard.albums.form.clearAll') }}
                    </UButton>
                  </div>

                  <div
                    class="grid grid-cols-4 gap-2 p-3 bg-gray-50 dark:bg-neutral-800/50 rounded-lg border border-gray-200 dark:border-neutral-700"
                  >
                    <div
                      v-for="photoId in selectedPhotoIds"
                      :key="photoId"
                      class="relative group aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-neutral-700"
                    >
                      <img
                        :src="
                          allPhotos.find((p) => p.id === photoId)
                            ?.thumbnailUrl || ''
                        "
                        :alt="photoId"
                        class="w-full h-full object-cover"
                      />

                      <div
                        v-if="coverPhotoId === photoId"
                        class="absolute top-1 left-1 bg-primary-500 text-white px-1.5 py-0.5 rounded text-xs font-medium"
                      >
                        {{ $t('dashboard.albums.modal.setCover') }}
                      </div>

                      <button
                        class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        @click="togglePhotoSelection(photoId)"
                      >
                        <Icon
                          name="tabler:x"
                          class="text-white"
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template #footer="{ close }">
            <UButton
              variant="ghost"
              color="neutral"
              @click="close"
            >
              {{ $t('dashboard.albums.slideover.cancel') }}
            </UButton>
            <UButton
              icon="tabler:check"
              :loading="isSubmittingForm"
              @click="formRef?.submit()"
            >
              {{ submitButtonLabel }}
            </UButton>
          </template>
        </USlideover>

        <UModal
          v-model:open="isPhotoSelectorOpen"
          portal
          scrollable
          :ui="{
            wrapper: 'z-220',
            overlay: 'z-220',
            content: 'z-221 w-full max-w-6xl overflow-hidden',
          }"
        >
          <template #content>
            <div class="flex h-[88vh] max-h-[88vh] flex-col">
              <div
                class="shrink-0 border-b border-gray-200 bg-white/80 p-4 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/80 sm:p-5"
              >
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <h2 class="text-lg font-semibold sm:text-xl">
                      {{ $t('dashboard.albums.modal.selectPhotos') }}
                    </h2>
                  </div>
                  <UButton
                    icon="tabler:x"
                    color="neutral"
                    variant="ghost"
                    @click="closePhotoSelector"
                  />
                </div>

                <div class="mt-4 space-y-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <UPopover
                      v-model:open="isSelectorFilterOpen"
                      :content="{
                        side: 'bottom',
                        align: 'start',
                        sideOffset: 8,
                      }"
                      :ui="{ content: 'z-230' }"
                    >
                      <UButton
                        icon="tabler:filter"
                        :color="hasActiveFilters ? 'info' : 'neutral'"
                        :variant="hasActiveFilters ? 'soft' : 'outline'"
                        size="sm"
                      >
                        {{ $t('ui.action.filter.title') }}
                        <UBadge
                          v-if="totalSelectedFilters > 0"
                          size="xs"
                          color="info"
                          variant="solid"
                          class="ml-1"
                        >
                          {{ totalSelectedFilters }}
                        </UBadge>
                      </UButton>

                      <template #content>
                        <UCard variant="glassmorphism">
                          <OverlayFilterPanel />
                        </UCard>
                      </template>
                    </UPopover>

                    <UButton
                      v-if="hasActiveFilters"
                      icon="tabler:filter-x"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      @click="clearAllFilters()"
                    >
                      {{ $t('ui.action.filter.clearAll') }}
                    </UButton>

                    <UButton
                      color="neutral"
                      variant="soft"
                      size="sm"
                      class="justify-center"
                      :icon="
                        areAllFilteredPhotosSelected
                          ? 'tabler:checkbox'
                          : areSomeFilteredPhotosSelected
                            ? 'tabler:minus'
                            : 'tabler:square'
                      "
                      @click="toggleAllFilteredPhotos"
                    >
                      {{ $t('dashboard.albums.modal.selectAll') }}
                    </UButton>

                    <div class="ml-auto flex flex-wrap items-center gap-1.5">
                      <UBadge
                        color="primary"
                        variant="soft"
                      >
                        {{
                          $t('dashboard.albums.modal.selectedPhotos', {
                            count: draftSelectedPhotoIds.length,
                          })
                        }}
                      </UBadge>
                      <UBadge
                        v-if="draftCoverPhotoId"
                        color="warning"
                        variant="soft"
                        icon="tabler:star-filled"
                      >
                        {{ $t('dashboard.albums.modal.coverSetInfo') }}
                      </UBadge>
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-if="selectedCounts.tags"
                      size="xs"
                      color="neutral"
                      variant="outline"
                    >
                      {{ $t('ui.action.filter.tabs.tags') }}:
                      {{ selectedCounts.tags }}
                    </UBadge>
                    <UBadge
                      v-if="selectedCounts.cameras"
                      size="xs"
                      color="neutral"
                      variant="outline"
                    >
                      {{ $t('ui.action.filter.tabs.cameras') }}:
                      {{ selectedCounts.cameras }}
                    </UBadge>
                    <UBadge
                      v-if="selectedCounts.lenses"
                      size="xs"
                      color="neutral"
                      variant="outline"
                    >
                      {{ $t('ui.action.filter.tabs.lenses') }}:
                      {{ selectedCounts.lenses }}
                    </UBadge>
                    <UBadge
                      v-if="selectedCounts.cities"
                      size="xs"
                      color="neutral"
                      variant="outline"
                    >
                      {{ $t('ui.action.filter.tabs.cities') }}:
                      {{ selectedCounts.cities }}
                    </UBadge>
                    <UBadge
                      v-if="selectedCounts.ratings"
                      size="xs"
                      color="neutral"
                      variant="outline"
                    >
                      {{ $t('ui.action.filter.tabs.ratings') }}
                    </UBadge>
                  </div>

                  <UCard
                    variant="subtle"
                    :ui="{
                      body: 'p-2 sm:p-2',
                    }"
                  >
                    <div>
                      <div
                        v-if="selectedPhotosPreview.length > 0"
                        class="flex h-full items-center gap-2 overflow-x-auto"
                      >
                        <button
                          v-for="photo in selectedPhotosPreview"
                          :key="photo.id"
                          class="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition"
                          :class="
                            draftCoverPhotoId === photo.id
                              ? 'border-warning-500'
                              : 'border-transparent hover:border-gray-300 dark:hover:border-neutral-500'
                          "
                          @click="setDraftCoverPhoto(photo.id)"
                        >
                          <ThumbImage
                            :src="photo.thumbnailUrl || ''"
                            :alt="photo.title || $t('ui.photo.altFallback')"
                            class="h-full w-full object-cover"
                          />
                          <div
                            v-if="draftCoverPhotoId === photo.id"
                            class="absolute inset-x-0 bottom-0 flex items-center justify-center bg-warning-500/90 py-0.5"
                          >
                            <Icon
                              name="tabler:star-filled"
                              size="12"
                              class="text-white"
                            />
                          </div>
                        </button>

                        <UBadge
                          v-if="selectedPhotosOverflowCount > 0"
                          variant="soft"
                          color="neutral"
                          class="shrink-0"
                        >
                          +{{ selectedPhotosOverflowCount }}
                        </UBadge>
                      </div>
                      <div
                        v-else
                        class="flex h-full items-center"
                      >
                        <div
                          class="flex h-12 w-full items-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50/80 px-3 text-xs text-gray-600 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-gray-300"
                        >
                          <Icon
                            name="tabler:photo-plus"
                            size="14"
                            class="shrink-0 text-gray-500 dark:text-gray-400"
                          />
                          <span class="truncate">
                            {{ $t('dashboard.albums.form.selectPhotos') }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </UCard>
                </div>
              </div>

              <div class="flex-1 overflow-y-auto p-3 sm:p-5">
                <div
                  v-if="selectorFilteredPhotos.length > 0"
                  class="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5 xl:grid-cols-6"
                >
                  <button
                    v-for="photo in selectorFilteredPhotos"
                    :key="photo.id"
                    class="group text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60"
                    @click="toggleDraftPhotoSelection(photo.id)"
                  >
                    <div
                      class="relative aspect-square overflow-hidden rounded-lg border bg-gray-200/90 transition-all duration-200 dark:bg-neutral-700/80"
                      :class="{
                        'border-primary-400 ring-1 ring-primary-300/60 dark:ring-primary-700/50':
                          draftSelectedPhotoIds.includes(photo.id),
                        'border-gray-200/70 hover:border-gray-300/90 dark:border-neutral-700 dark:hover:border-neutral-500':
                          !draftSelectedPhotoIds.includes(photo.id),
                      }"
                    >
                      <ThumbImage
                        :src="photo.thumbnailUrl || ''"
                        :alt="photo.title || $t('ui.photo.altFallback')"
                        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />

                      <div
                        class="absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-black/55 via-black/10 to-transparent"
                      />

                      <div
                        class="absolute inset-x-2 bottom-1.5 flex items-end justify-between gap-2"
                      >
                        <div class="min-w-0">
                          <p
                            class="truncate text-[10px] font-medium text-white/92"
                          >
                            {{ photo.title || photo.storageKey || $t('ui.photo.untitled') }}
                          </p>
                          <p class="truncate text-[9px] text-white/72">
                            {{ photo.city
                                ? `${photo.city} · ${dayjs(photo.createdAt).tz('Asia/Shanghai').format('MM-DD')}`
                                : dayjs(photo.createdAt).tz('Asia/Shanghai').format('YYYY-MM-DD')
                            }}
                          </p>
                        </div>
                      </div>

                      <div
                        v-if="draftSelectedPhotoIds.includes(photo.id)"
                        class="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-white/85 bg-primary-500 px-1 text-white shadow-sm"
                      >
                        <span
                          v-if="getDraftPhotoOrder(photo.id)"
                          class="text-[10px] font-semibold"
                        >
                          {{ getDraftPhotoOrder(photo.id) }}
                        </span>
                        <Icon
                          v-else
                          name="tabler:check"
                          size="14"
                        />
                      </div>

                      <UButton
                        v-if="draftCoverPhotoId !== photo.id"
                        size="xs"
                        color="warning"
                        variant="solid"
                        icon="tabler:star"
                        class="absolute right-1.5 top-1.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
                        @click.stop="setDraftCoverPhoto(photo.id)"
                      />

                      <UBadge
                        v-else
                        color="warning"
                        variant="solid"
                        icon="tabler:star-filled"
                        class="absolute right-1.5 top-1.5"
                      >
                        {{ $t('dashboard.albums.modal.setCover') }}
                      </UBadge>
                    </div>
                  </button>
                </div>

                <div
                  v-else
                  class="flex h-64 flex-col items-center justify-center text-gray-500"
                >
                  <Icon
                    name="tabler:image-off"
                    size="48"
                    class="mb-3 opacity-50"
                  />
                  <p class="font-medium">
                    {{
                      hasActiveFilters
                        ? $t('dashboard.albums.modal.noResults')
                        : $t('dashboard.albums.modal.noPhotos')
                    }}
                  </p>
                  <p
                    v-if="hasActiveFilters"
                    class="mt-1 text-sm"
                  >
                    {{ $t('dashboard.albums.modal.tryOtherKeywords') }}
                  </p>
                </div>
              </div>

              <div
                class="shrink-0 border-t border-gray-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900 sm:p-4"
              >
                <div
                  class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end"
                >
                  <UButton
                    variant="outline"
                    color="neutral"
                    class="w-full sm:w-auto"
                    @click="closePhotoSelector"
                  >
                    {{ $t('dashboard.albums.slideover.cancel') }}
                  </UButton>
                  <UButton
                    icon="tabler:check"
                    color="primary"
                    class="w-full sm:w-auto"
                    @click="confirmPhotoSelection"
                  >
                    {{
                      $t('dashboard.albums.modal.confirm', {
                        count: draftSelectedPhotoIds.length,
                      })
                    }}
                  </UButton>
                </div>
              </div>
            </div>
          </template>
        </UModal>

        <UModal v-model:open="isDeleteConfirmOpen">
          <template #content>
            <div class="p-6 space-y-4">
              <div class="flex items-center gap-3">
                <div
                  class="shrink-0 w-10 h-10 bg-error-100 dark:bg-error-900/30 rounded-full flex items-center justify-center"
                >
                  <Icon
                    name="tabler:alert-circle"
                    class="text-error-500"
                  />
                </div>
                <div>
                  <h3 class="text-lg font-semibold">
                    {{
                      isResetScanConfirm
                        ? $t('dashboard.albums.reset.title')
                        : $t('dashboard.albums.delete.title')
                    }}
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {{
                      isResetScanConfirm
                        ? $t('dashboard.albums.reset.message', {
                            title: currentAlbum?.title,
                          })
                        : $t('dashboard.albums.delete.message', {
                            title: currentAlbum?.title,
                          })
                    }}
                  </p>
                </div>
              </div>

              <div class="flex justify-end gap-2 pt-4">
                <UButton
                  variant="ghost"
                  color="neutral"
                  @click="isDeleteConfirmOpen = false"
                >
                  {{ $t('dashboard.albums.delete.cancel') }}
                </UButton>
                <UButton
                  :color="isResetScanConfirm ? 'warning' : 'error'"
                  :icon="isResetScanConfirm ? 'tabler:eraser' : 'tabler:trash'"
                  @click="confirmDestructive"
                >
                  {{
                    isResetScanConfirm
                      ? $t('dashboard.albums.reset.confirm')
                      : $t('dashboard.albums.delete.confirm')
                  }}
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <UModal v-model:open="isResetUidConfirmOpen">
          <template #content>
            <div class="p-6 space-y-4">
              <div class="flex items-center gap-3">
                <div
                  class="shrink-0 w-10 h-10 bg-error-100 dark:bg-error-900/30 rounded-full flex items-center justify-center"
                >
                  <Icon name="tabler:refresh" class="text-error-500" />
                </div>
                <div>
                  <h3 class="text-lg font-semibold">
                    {{ $t('dashboard.albums.form.resetUid') }}
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {{ $t('dashboard.albums.form.resetUidMessage') }}
                  </p>
                </div>
              </div>

              <div class="flex justify-end gap-2 pt-4">
                <UButton
                  variant="ghost"
                  color="neutral"
                  :disabled="isResettingUid"
                  @click="isResetUidConfirmOpen = false"
                >
                  {{ $t('dashboard.albums.delete.cancel') }}
                </UButton>
                <UButton
                  color="error"
                  :icon="isResettingUid ? '' : 'tabler:refresh'"
                  :loading="isResettingUid"
                  @click="confirmResetUid"
                >
                  {{ $t('dashboard.albums.form.resetUidConfirm') }}
                </UButton>
              </div>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
