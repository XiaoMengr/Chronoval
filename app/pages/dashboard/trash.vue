<script lang="ts" setup>
import type { Photo } from '~~/server/utils/db'
import ThumbImage from '~/components/ui/ThumbImage.vue'
import { isPanorama } from '~/utils/panorama'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.trash'),
})

const dayjs = useDayjs()

const { data, refresh } = await useFetch<Photo[]>('/api/trash', {
  default: () => [],
})

const trashPhotos = computed(() => data.value || [])

// ---- 瀑布流布局（与 dashboard/photos 一致）----

// 砖内固有比例：优先已入库的 CSS 长宽比，其次按宽高推算，缺失时兜底 3:4
const aspectStyle = (p: Photo) => {
  let ratio = p.aspectRatio
  if (!ratio && p.width && p.height) ratio = p.width / p.height
  return { aspectRatio: ratio ? String(ratio) : '3 / 4' }
}

// 增量渲染：首屏只挂载有限数量，滚动到底部哨兵再追加
const MASONRY_STEP = 60
const masonryRenderedCount = ref(0)
const masonryScrollContainerRef = ref<HTMLElement>()
const masonrySentinelRef = ref<HTMLElement>()
const masonryObserver = ref<IntersectionObserver | null>(null)
const masonryItems = computed(() =>
  trashPhotos.value.slice(0, masonryRenderedCount.value).map((photo, i) => ({
    id: photo.id,
    photo,
    originalIndex: i,
  })),
)

watch(
  () => trashPhotos.value,
  () => {
    masonryRenderedCount.value = trashPhotos.value.length
      ? Math.min(MASONRY_STEP, trashPhotos.value.length)
      : 0
  },
  { immediate: true },
)

const appendMasonryBatch = () => {
  const total = trashPhotos.value?.length ?? 0
  if (masonryRenderedCount.value >= total) return
  masonryRenderedCount.value = Math.min(
    masonryRenderedCount.value + MASONRY_STEP,
    total,
  )
}

onMounted(() => {
  if (masonrySentinelRef.value) {
    const root = masonryScrollContainerRef.value || null
    masonryObserver.value = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) appendMasonryBatch()
      },
      { root },
    )
    masonryObserver.value.observe(masonrySentinelRef.value)
  }
})

onBeforeUnmount(() => {
  masonryObserver.value?.disconnect()
})

// 恢复单张
const restoringId = ref<string | null>(null)
const restorePhoto = async (photo: Photo) => {
  restoringId.value = photo.id
  try {
    await $fetch(`/api/trash/${photo.id}/restore`, { method: 'POST' })
    await refresh()
    toast.add({
      title: $t('dashboard.photos.trash.messages.restoreSuccess'),
      color: 'success',
    })
  } catch (error: any) {
    toast.add({
      title: error?.message || $t('dashboard.photos.messages.error'),
      color: 'error',
    })
  } finally {
    restoringId.value = null
  }
}

// 恢复全部
const isRestoringAll = ref(false)
const restoreAll = async () => {
  isRestoringAll.value = true
  try {
    await Promise.all(
      trashPhotos.value.map((photo) =>
        $fetch(`/api/trash/${photo.id}/restore`, { method: 'POST' }),
      ),
    )
    await refresh()
    toast.add({
      title: $t('dashboard.photos.trash.messages.restoreAllSuccess', {
        count: trashPhotos.value.length,
      }),
      color: 'success',
    })
  } catch (error: any) {
    toast.add({
      title: error?.message || $t('dashboard.photos.messages.error'),
      color: 'error',
    })
  } finally {
    isRestoringAll.value = false
  }
}

// 打开预览弹窗
const isPreviewOpen = ref(false)
const previewPhoto = ref<Photo | null>(null)
const openPreview = (photo: Photo) => {
  previewPhoto.value = photo
  isPreviewOpen.value = true
}

// 彻底删除单张
const isDeleteForeverOpen = ref(false)
const deleteForeverTarget = ref<Photo | null>(null)
const isDeletingForever = ref(false)

const requestDeleteForever = (photo: Photo) => {
  deleteForeverTarget.value = photo
  isDeleteForeverOpen.value = true
}

const confirmDeleteForever = async () => {
  const photo = deleteForeverTarget.value
  if (!photo) return
  isDeletingForever.value = true
  try {
    await $fetch(`/api/trash/${photo.id}`, { method: 'DELETE' })
    await refresh()
    toast.add({
      title: $t('dashboard.photos.trash.messages.deleteForeverSuccess'),
      color: 'success',
    })
    isDeleteForeverOpen.value = false
    deleteForeverTarget.value = null
  } catch (error: any) {
    toast.add({
      title: error?.message || $t('dashboard.photos.messages.error'),
      color: 'error',
    })
  } finally {
    isDeletingForever.value = false
  }
}

// 清空回收站
const isEmptyTrashOpen = ref(false)
const isClearing = ref(false)

const requestEmptyTrash = () => {
  isEmptyTrashOpen.value = true
}

const confirmEmptyTrash = async () => {
  isClearing.value = true
  try {
    await Promise.all(
      trashPhotos.value.map((photo) =>
        $fetch(`/api/trash/${photo.id}`, { method: 'DELETE' }),
      ),
    )
    await refresh()
    toast.add({
      title: $t('dashboard.photos.trash.messages.empty'),
      color: 'success',
    })
    isEmptyTrashOpen.value = false
  } catch (error: any) {
    toast.add({
      title: error?.message || $t('dashboard.photos.messages.error'),
      color: 'error',
    })
  } finally {
    isClearing.value = false
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.trash')">
        <template #right>
          <div class="flex gap-2 items-center">
            <UButton
              v-if="trashPhotos.length > 0"
              variant="soft"
              color="success"
              icon="tabler:device-floppy"
              :loading="isRestoringAll"
              :disabled="isRestoringAll"
              @click="restoreAll"
            >
              {{ $t('dashboard.photos.trash.actions.restoreAll') }}
            </UButton>
            <UButton
              v-if="trashPhotos.length > 0"
              variant="soft"
              color="error"
              icon="tabler:trash-off"
              @click="requestEmptyTrash"
            >
              {{ $t('dashboard.photos.trash.actions.empty') }}
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 flex-1 min-h-0 p-4">
        <p class="text-sm text-(--ui-text-muted)">
          {{ $t('dashboard.photos.trash.subtitle') }}
        </p>

        <!-- 空状态 -->
        <div
          v-if="trashPhotos.length === 0"
          class="flex-1 flex flex-col items-center justify-center gap-3 text-center"
        >
          <Icon name="tabler:trash" class="size-12 text-(--ui-text-muted)" />
          <div class="text-lg font-medium">
            {{ $t('dashboard.photos.trash.empty') }}
          </div>
          <p class="text-sm text-(--ui-text-muted)">
            {{ $t('dashboard.photos.trash.emptyHint') }}
          </p>
        </div>

        <!-- 回收站瀑布流：高度受面板约束，内部滚动 -->
        <div
          v-else
          ref="masonryScrollContainerRef"
          class="relative flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth"
        >
          <MasonryWall
            :items="masonryItems"
            :column-width="236"
            :gap="10"
            :min-columns="2"
            :max-columns="8"
            :ssr-columns="2"
            :key-mapper="
              (_item, _column, _row, index) =>
                masonryItems[index]?.originalIndex ?? index
            "
            class="p-2"
          >
            <template #default="{ item }">
              <div
                v-if="item.photo"
                :key="item.photo.id"
                class="group relative overflow-hidden rounded-xl border border-(--ui-border) bg-(--ui-bg-elevated) shadow-sm cursor-pointer"
                @click="openPreview(item.photo)"
              >
                <ThumbImage
                  :src="item.photo.thumbnailUrl || item.photo.originalUrl || ''"
                  :alt="item.photo.title || ''"
                  :thumbhash="item.photo.thumbnailHash || ''"
                  class="block w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  :style="aspectStyle(item.photo)"
                />

                <!-- 悬停操作菜单：恢复 / 彻底删除 -->
                <div
                  class="absolute right-2 top-2 flex gap-1 rounded-lg bg-black/35 p-1 opacity-0 backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100"
                >
                  <UTooltip
                    :text="$t('dashboard.photos.trash.actions.restore')"
                  >
                    <UButton
                      icon="tabler:device-floppy"
                      variant="ghost"
                      color="white"
                      size="xs"
                      :loading="restoringId === item.photo.id"
                      @click.stop="restorePhoto(item.photo)"
                    />
                  </UTooltip>
                  <UTooltip
                    :text="$t('dashboard.photos.trash.actions.deleteForever')"
                  >
                    <UButton
                      icon="tabler:trash-off"
                      variant="ghost"
                      color="white"
                      size="xs"
                      @click.stop="requestDeleteForever(item.photo)"
                    />
                  </UTooltip>
                </div>

                <!-- LivePhoto 标记 -->
                <div
                  v-if="item.photo.isLivePhoto"
                  class="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 backdrop-blur-md"
                >
                  <Icon
                    name="tabler:live-photo"
                    class="size-3.5 text-yellow-300"
                  />
                </div>

                <!-- 360° 全景角标 -->
                <div
                  v-if="isPanorama(item.photo)"
                  class="pointer-events-none absolute top-2 left-2 z-10"
                >
                  <div
                    class="flex items-center gap-0.5 rounded-full bg-black/45 py-1 pl-1.5 pr-1.5 text-[13px] font-bold leading-none text-white backdrop-blur-md saturate-150"
                  >
                    <Icon name="tabler:rotate-360" class="size-[17px]" />
                    <span>360°</span>
                  </div>
                </div>

                <!-- 删除时间角标 -->
                <div
                  class="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 backdrop-blur-md"
                >
                  <Icon
                    name="tabler:clock"
                    class="size-3.5 text-white/80"
                  />
                  <span class="text-[11px] font-medium text-white/90">
                    {{
                      item.photo.deletedAt
                        ? dayjs(item.photo.deletedAt).format('MM-DD HH:mm')
                        : ''
                    }}
                  </span>
                </div>
              </div>
            </template>
          </MasonryWall>

          <!-- 增量渲染哨兵：滚动接近底部时追加下一批照片 -->
          <div
            v-if="masonryRenderedCount < (trashPhotos?.length ?? 0)"
            ref="masonrySentinelRef"
            class="h-px w-full"
            aria-hidden="true"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- 预览弹窗 -->
  <UModal
    v-model:open="isPreviewOpen"
    :title="previewPhoto?.title || previewPhoto?.id"
  >
    <div class="flex items-center justify-center p-2">
      <ThumbImage
        v-if="previewPhoto"
        :src="previewPhoto.originalUrl || previewPhoto.thumbnailUrl || ''"
        :alt="previewPhoto.title || previewPhoto.id"
        :thumbhash="previewPhoto.thumbnailHash"
        lazy
        image-contain
        class="max-h-[70vh] w-full"
      />
    </div>
  </UModal>

  <!-- 彻底删除确认 -->
  <UModal
    v-model:open="isDeleteForeverOpen"
    :title="$t('dashboard.photos.trash.confirm.deleteForever.title')"
  >
    <div class="space-y-4">
      <p class="text-sm text-(--ui-text-muted)">
        {{ $t('dashboard.photos.trash.confirm.deleteForever.message') }}
      </p>
      <div class="flex justify-end gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          @click="isDeleteForeverOpen = false"
        >
          {{ $t('dashboard.photos.trash.messages.cancel') }}
        </UButton>
        <UButton
          color="error"
          :loading="isDeletingForever"
          @click="confirmDeleteForever"
        >
          {{ $t('dashboard.photos.trash.messages.confirm') }}
        </UButton>
      </div>
    </div>
  </UModal>

  <!-- 清空回收站确认 -->
  <UModal
    v-model:open="isEmptyTrashOpen"
    :title="$t('dashboard.photos.trash.confirm.deleteForeverAll.title')"
  >
    <div class="space-y-4">
      <p class="text-sm text-(--ui-text-muted)">
        {{
          $t('dashboard.photos.trash.confirm.deleteForeverAll.message', {
            count: trashPhotos.length,
          })
        }}
      </p>
      <div class="flex justify-end gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          @click="isEmptyTrashOpen = false"
        >
          {{ $t('dashboard.photos.trash.messages.cancel') }}
        </UButton>
        <UButton
          color="error"
          :loading="isClearing"
          @click="confirmEmptyTrash"
        >
          {{ $t('dashboard.photos.trash.messages.confirm') }}
        </UButton>
      </div>
    </div>
  </UModal>
</template>