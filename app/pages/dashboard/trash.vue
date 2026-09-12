<script lang="ts" setup>
import type { Photo } from '~~/server/utils/db'
import ThumbImage from '~/components/ui/ThumbImage.vue'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.trash'),
})

const dayjs = useDayjs()

const { data, refresh, status } = await useFetch<Photo[]>('/api/trash', {
  default: () => [],
})

const trashPhotos = computed(() => data.value || [])

// 打开预览弹窗
const isPreviewOpen = ref(false)
const previewPhoto = ref<Photo | null>(null)
const openPreview = (photo: Photo) => {
  previewPhoto.value = photo
  isPreviewOpen.value = true
}

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

        <!-- 回收站照片网格 -->
        <UTable
          v-else
          :columns="[
            { key: 'thumbnail', label: '' },
            { key: 'title', label: $t('dashboard.photos.table.columns.title') },
            { key: 'source', label: $t('dashboard.photos.actions.delete') },
            {
              key: 'deletedAt',
              label: $t('dashboard.photos.trash.deletedAtColumn'),
            },
            { key: 'actions', label: '', class: 'w-[160px]' },
          ]"
          :rows="trashPhotos"
          :loading="status === 'pending'"
          class="min-h-0"
        >
          <template #thumbnail-data="{ row }">
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="size-12 shrink-0 overflow-hidden rounded-lg cursor-pointer ring-1 ring-(--ui-border)"
                @click="openPreview(row)"
              >
                <ThumbImage
                  :src="row.thumbnailUrl || row.originalUrl || ''"
                  :alt="row.title || row.id"
                  :thumbhash="row.thumbnailHash"
                  lazy
                  class="size-12"
                />
              </button>
            </div>
          </template>

          <template #title-data="{ row }">
            <div class="max-w-56 truncate">
              <button
                type="button"
                class="cursor-pointer hover:underline"
                @click="openPreview(row)"
              >
                {{ row.title || row.id }}
              </button>
            </div>
          </template>

          <template #source-data="{ row }">
            <UBadge
              :color="row.source === 'library' ? 'primary' : 'neutral'"
              variant="soft"
            >
              {{
                row.source === 'library'
                  ? $t('dashboard.photos.trash.originalInLibrary')
                  : $t('dashboard.photos.photoFilter.static')
              }}
            </UBadge>
          </template>

          <template #deletedAt-data="{ row }">
            <span class="text-sm text-(--ui-text-muted)">
              {{
                row.deletedAt
                  ? dayjs(row.deletedAt).format('YYYY-MM-DD HH:mm')
                  : ''
              }}
            </span>
          </template>

          <template #actions-data="{ row }">
            <div class="flex items-center justify-end gap-1">
              <UTooltip
                :text="$t('dashboard.photos.trash.actions.restore')"
              >
                <UButton
                  icon="tabler:device-floppy"
                  variant="ghost"
                  color="success"
                  size="sm"
                  :loading="restoringId === row.id"
                  @click="restorePhoto(row)"
                />
              </UTooltip>
              <UTooltip
                :text="$t('dashboard.photos.trash.actions.deleteForever')"
              >
                <UButton
                  icon="tabler:trash-off"
                  variant="ghost"
                  color="error"
                  size="sm"
                  @click="requestDeleteForever(row)"
                />
              </UTooltip>
            </div>
          </template>
        </UTable>
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