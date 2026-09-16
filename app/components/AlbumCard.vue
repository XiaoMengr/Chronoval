<script lang="ts" setup>
interface CardCover {
  thumbnailUrl: string | null
  thumbnailHash?: string | null
}

const props = withDefaults(
  defineProps<{
    album: any
    size?: 'md' | 'card' | 'sm' | 'row'
    expanded?: boolean
  }>(),
  {
    size: 'md',
    expanded: false,
  },
)

const emit = defineEmits<{
  expand: []
  edit: []
  reset: []
  delete: []
  view: []
}>()

const { t } = useI18n()

const isScan = computed(() => props.album?.kind === 'scan')
const hasChildren = computed(
  () => (props.album?.children || []).length > 0,
)

const usableCovers = computed<string[]>(() =>
  (props.album?.covers || [])
    .map((c: CardCover) => c.thumbnailUrl)
    .filter(Boolean),
)
const coverPrimary = computed(
  () =>
    usableCovers.value[0] ||
    props.album?.coverPhoto?.thumbnailUrl ||
    '',
)
// 封面拼贴：仅当存在至少 2 张不重复封面时才启用
const uniqueCovers = computed(() => [...new Set(usableCovers.value)])
const useCollage = computed(() => uniqueCovers.value.length >= 2)

const onImgError = (e: Event) => {
  const el = e.target as HTMLImageElement
  el.style.display = 'none'
}

const menuItems = computed(() => {
  const groups: any[][] = [
    [
      {
        label: t('dashboard.albums.card.actions.view'),
        icon: 'tabler:external-link',
        onSelect: () => emit('view'),
      },
      {
        label: t('dashboard.albums.card.actions.edit'),
        icon: 'tabler:pencil',
        onSelect: () => emit('edit'),
      },
    ],
  ]
  if (isScan.value && props.album?.hasCustom) {
    groups.push([
      {
        label: t('dashboard.albums.card.actions.reset'),
        icon: 'tabler:eraser',
        color: 'amber',
        onSelect: () => emit('reset'),
      },
    ])
  }
  if (!isScan.value) {
    groups.push([
      {
        label: t('dashboard.albums.card.actions.delete'),
        icon: 'tabler:trash',
        color: 'error',
        onSelect: () => emit('delete'),
      },
    ])
  }
  return groups
})
</script>

<template>
  <!-- 列表行：紧凑展示，相簿较多时的省空间视图 -->
  <div
    v-if="size === 'row'"
    class="group flex items-center gap-3 rounded-xl ring-1 ring-(--ui-border) bg-(--ui-bg)/70 px-2.5 py-1.5 transition-colors hover:bg-(--ui-bg-elevated) hover:ring-(--ui-border-accented)"
  >
    <button
      v-if="isScan && hasChildren"
      type="button"
      class="relative aspect-[4/3] w-12 shrink-0 overflow-hidden rounded-lg bg-(--ui-bg-elevated)"
      :title="t('dashboard.albums.table.expand')"
      @click.stop="emit('expand')"
    >
      <img
        v-if="coverPrimary"
        :src="coverPrimary"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
        :alt="$t('ui.photo.altFallback')"
        @error="onImgError"
      />
      <Icon
        v-else
        name="tabler:folder-heart"
        size="16"
        class="absolute inset-0 m-auto text-(--ui-text-muted)"
      />
    </button>
    <button
      v-else
      type="button"
      class="relative aspect-[4/3] w-12 shrink-0 overflow-hidden rounded-lg bg-(--ui-bg-elevated)"
      :title="t('dashboard.albums.card.actions.view')"
      @click="emit('view')"
    >
      <img
        v-if="coverPrimary"
        :src="coverPrimary"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
        :alt="$t('ui.photo.altFallback')"
        @error="onImgError"
      />
      <Icon
        v-else
        :name="isScan ? 'tabler:folder-heart' : 'tabler:album'"
        size="16"
        class="absolute inset-0 m-auto text-(--ui-text-muted)"
      />
    </button>

    <div class="min-w-0 flex-1">
      <p class="truncate text-[13px] font-medium text-(--ui-text)">
        {{ album.title }}
      </p>
      <div
        class="mt-0.5 flex items-center gap-x-2 gap-y-0.5 text-[11px] text-(--ui-text-muted)"
      >
        <span class="flex items-center gap-0.5 tabular-nums">
          <Icon name="tabler:photo" size="12" />
          {{ album.photoCount || 0 }}
        </span>
        <span v-if="isScan" class="flex items-center gap-0.5">
          <Icon name="tabler:book-2" size="12" />
          {{ t('dashboard.albums.table.external') }}
        </span>
        <span
          v-if="album.hasCustom"
          class="flex items-center gap-0.5 text-amber-500"
        >
          <Icon name="tabler:wand" size="12" />
          {{ t('dashboard.albums.table.customized') }}
        </span>
        <Icon
          v-if="album.passwordProtected"
          name="tabler:lock"
          size="12"
          class="text-rose-500"
        />
        <Icon
          v-if="album.isHidden"
          name="tabler:eye-off"
          size="12"
          class="text-(--ui-text-dimmed)"
        />
      </div>
    </div>

    <!-- 二级相簿：展开计数入口 -->
    <button
      v-if="isScan && hasChildren"
      type="button"
      class="flex shrink-0 items-center gap-0.5 rounded-md bg-(--ui-bg-elevated) px-1.5 py-1 text-[11px] text-(--ui-text-muted) transition hover:bg-primary-500/10 hover:text-primary-600 dark:hover:text-primary-400"
      :title="t('dashboard.albums.table.expand')"
      @click.stop="emit('expand')"
    >
      <Icon
        :name="expanded ? 'tabler:chevron-up' : 'tabler:chevron-down'"
        size="13"
      />
      {{ album.children?.length || 0 }}
    </button>

    <!-- 操作按钮 -->
    <div class="flex shrink-0 items-center gap-1">
      <UButton
        variant="soft"
        color="neutral"
        size="xs"
        icon="tabler:external-link"
        :aria-label="t('dashboard.albums.card.actions.view')"
        :title="t('dashboard.albums.card.actions.view')"
        @click="emit('view')"
      />
      <UButton
        variant="soft"
        color="neutral"
        size="xs"
        icon="tabler:pencil"
        :aria-label="t('dashboard.albums.card.actions.edit')"
        :title="t('dashboard.albums.card.actions.edit')"
        @click="emit('edit')"
      />
      <UDropdownMenu :content="{ align: 'end' }" :items="menuItems">
        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          icon="tabler:dots-vertical"
          @click.stop
        />
      </UDropdownMenu>
    </div>
  </div>

  <!-- 中型卡片：图片在上、信息卡在下（中型布局专用） -->
  <div
    v-else-if="size === 'card'"
    class="group flex flex-col overflow-hidden rounded-xl ring-1 ring-(--ui-border) bg-(--ui-bg) transition-all duration-300 hover:ring-(--ui-border-accented) hover:shadow-md hover:shadow-black/5"
  >
    <button
      type="button"
      class="relative block aspect-[16/10] w-full shrink-0 overflow-hidden bg-(--ui-bg-elevated) text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60"
      :title="t('dashboard.albums.card.actions.view')"
      @click="emit('view')"
    >
      <img
        v-if="coverPrimary"
        :src="coverPrimary"
        class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        loading="lazy"
        :alt="$t('ui.photo.altFallback')"
        @error="onImgError"
      />
      <div
        v-else
        class="flex h-full w-full items-center justify-center bg-linear-to-br from-(--ui-bg-elevated) to-(--ui-bg)"
      >
        <Icon
          :name="isScan ? 'tabler:folder-heart' : 'tabler:album'"
          size="28"
          class="text-(--ui-text-muted)"
        />
      </div>

      <!-- 左上：展开二级相簿 -->
      <button
        v-if="isScan && hasChildren"
        type="button"
        class="absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded-lg bg-black/40 text-white shadow-sm backdrop-blur-md transition hover:bg-black/60"
        :aria-label="$t('dashboard.albums.table.expand')"
        @click.stop="emit('expand')"
      >
        <Icon
          :name="expanded ? 'tabler:chevron-down' : 'tabler:chevron-right'"
          size="14"
        />
      </button>

      <!-- 右上：锁定状态 -->
      <span
        v-if="album.passwordProtected"
        class="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-lg bg-black/40 text-rose-200 shadow-sm backdrop-blur-md"
        :title="t('dashboard.albums.card.locked')"
      >
        <Icon name="tabler:lock" size="12" />
      </span>

      <!-- 右下：照片数 -->
      <span
        class="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-md"
      >
        <Icon name="tabler:photo" size="12" />
        {{ album.photoCount || 0 }}
      </span>
    </button>

    <!-- 下半部分信息卡 -->
    <div class="flex min-w-0 flex-1 flex-col gap-1.5 p-2">
      <div class="flex items-start justify-between gap-2">
        <button
          type="button"
          class="min-w-0 text-left"
          :title="t('dashboard.albums.card.actions.view')"
          @click="emit('view')"
        >
          <p class="truncate text-[13px] font-semibold leading-tight text-(--ui-text)">
            {{ album.title }}
          </p>
        </button>
        <UDropdownMenu :content="{ align: 'end' }" :items="menuItems">
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="tabler:dots-vertical"
            @click.stop
          />
        </UDropdownMenu>
      </div>

      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-(--ui-text-muted)">
        <button
          v-if="isScan && hasChildren"
          type="button"
          class="flex items-center gap-1 rounded-md bg-(--ui-bg-elevated) px-1.5 py-0.5 transition hover:bg-primary-500/10 hover:text-primary-600 dark:hover:text-primary-400"
          :title="t('dashboard.albums.table.expand')"
          @click="emit('expand')"
        >
          <Icon
            :name="expanded ? 'tabler:chevron-down' : 'tabler:chevron-right'"
            size="12"
          />
          {{ album.children?.length || 0 }}
          {{ t('dashboard.albums.subAlbums') }}
        </button>
        <span
          v-if="isScan"
          class="flex items-center gap-1 rounded-md bg-(--ui-bg-elevated) px-1.5 py-0.5"
        >
          <Icon name="tabler:book-2" size="12" />
          {{ t('dashboard.albums.table.external') }}
        </span>
        <span
          v-if="album.hasCustom"
          class="flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-amber-600 dark:text-amber-400"
        >
          <Icon name="tabler:wand" size="12" />
          {{ t('dashboard.albums.table.customized') }}
        </span>
        <Icon
          v-if="album.isHidden"
          name="tabler:eye-off"
          size="12"
          class="text-(--ui-text-dimmed)"
        />
        <span
          v-if="album.description"
          class="truncate text-(--ui-text-dimmed)"
        >
          {{ album.description }}
        </span>
      </div>

      <div class="mt-auto flex items-center gap-2 border-t border-(--ui-border)/60 pt-1.5">
        <UButton
          color="primary"
          size="xs"
          icon="tabler:external-link"
          @click="emit('view')"
        >
          {{ t('dashboard.albums.card.actions.view') }}
        </UButton>
        <UButton
          variant="outline"
          color="neutral"
          size="xs"
          icon="tabler:pencil"
          @click="emit('edit')"
        >
          {{ t('dashboard.albums.card.actions.edit') }}
        </UButton>
      </div>
    </div>
  </div>

  <!-- 二级相簿：紧凑横向行（嵌套在父卡片下方） -->
  <div
    v-else-if="size === 'sm'"
    class="group flex items-center gap-2.5 rounded-lg ring-1 ring-(--ui-border) bg-(--ui-bg)/70 px-2 py-1.5 transition-colors hover:bg-(--ui-bg-elevated) hover:ring-(--ui-border-accented)"
  >
    <button
      type="button"
      class="relative size-9 shrink-0 overflow-hidden rounded-md bg-(--ui-bg-elevated)"
      @click="emit('view')"
    >
      <img
        v-if="coverPrimary"
        :src="coverPrimary"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
        :alt="$t('ui.photo.altFallback')"
        @error="onImgError"
      />
      <Icon
        v-else
        name="tabler:folder"
        size="15"
        class="absolute inset-0 m-auto text-(--ui-text-muted)"
      />
    </button>

    <div class="min-w-0 flex-1">
      <p class="truncate text-[13px] font-medium text-(--ui-text)">
        {{ album.title }}
      </p>
      <div
        class="mt-0.5 flex items-center gap-1.5 text-[11px] text-(--ui-text-muted)"
      >
        <span class="flex items-center gap-0.5 tabular-nums">
          <Icon name="tabler:photo" size="12" />
          {{ album.photoCount || 0 }}
        </span>
        <Icon
          v-if="album.passwordProtected"
          name="tabler:lock"
          size="12"
          class="text-rose-500"
        />
        <Icon
          v-if="album.isHidden"
          name="tabler:eye-off"
          size="12"
          class="text-(--ui-text-dimmed)"
        />
        <Icon
          v-if="album.hasCustom"
          name="tabler:wand"
          size="12"
          class="text-amber-500"
        />
      </div>
    </div>

    <UDropdownMenu :content="{ align: 'end' }" :items="menuItems">
      <UButton
        variant="ghost"
        color="neutral"
        size="xs"
        icon="tabler:dots-vertical"
        @click.stop
      />
    </UDropdownMenu>
  </div>

  <!-- 顶层相簿：封面 + 明确操作区 -->
  <div
    v-else
    class="group flex flex-col overflow-hidden rounded-2xl ring-1 ring-(--ui-border) bg-(--ui-bg) shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 hover:ring-(--ui-border-accented)"
  >
    <button
      type="button"
      class="relative block aspect-[16/10] w-full shrink-0 overflow-hidden bg-(--ui-bg-elevated) text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60"
      :title="t('dashboard.albums.card.actions.view')"
      @click="emit('view')"
    >
      <!-- 封面拼贴：外部库多封面时展示不对称拼图 -->
      <div v-if="useCollage" class="grid h-full w-full grid-cols-[1.35fr_1fr]">
        <div
          class="relative h-full overflow-hidden border-r border-black/5 dark:border-white/10"
        >
          <img
            :src="uniqueCovers[0]"
            class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
            loading="lazy"
            :alt="$t('ui.photo.altFallback')"
            @error="onImgError"
          />
        </div>
        <div class="grid h-full grid-rows-2">
          <div
            class="relative overflow-hidden border-b border-black/5 dark:border-white/10"
          >
            <img
              :src="uniqueCovers[1]"
              class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
              loading="lazy"
              :alt="$t('ui.photo.altFallback')"
              @error="onImgError"
            />
          </div>
          <div class="relative overflow-hidden">
            <img
              v-if="uniqueCovers[2]"
              :src="uniqueCovers[2]"
              class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
              loading="lazy"
              :alt="$t('ui.photo.altFallback')"
              @error="onImgError"
            />
          </div>
        </div>
      </div>

      <img
        v-else-if="coverPrimary"
        :src="coverPrimary"
        class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
        loading="lazy"
        :alt="$t('ui.photo.altFallback')"
        @error="onImgError"
      />
      <div
        v-else
        class="flex h-full w-full items-center justify-center bg-linear-to-br from-(--ui-bg-elevated) to-(--ui-bg)"
      >
        <Icon
          :name="isScan ? 'tabler:folder-heart' : 'tabler:album'"
          size="36"
          class="text-(--ui-text-muted)"
        />
      </div>

      <!-- 左下：展开二级相簿 -->
      <button
        v-if="isScan && hasChildren"
        type="button"
        class="absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded-lg bg-black/40 text-white shadow-sm backdrop-blur-md transition hover:bg-black/60"
        :aria-label="$t('dashboard.albums.table.expand')"
        @click.stop="emit('expand')"
      >
        <Icon
          :name="expanded ? 'tabler:chevron-down' : 'tabler:chevron-right'"
          size="15"
        />
      </button>

      <!-- 右上：锁定状态 -->
      <span
        v-if="album.passwordProtected"
        class="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-lg bg-black/40 text-rose-200 shadow-sm backdrop-blur-md"
        :title="t('dashboard.albums.card.locked')"
      >
        <Icon name="tabler:lock" size="13" />
      </span>

      <!-- 右下：照片数 -->
      <span
        class="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-md"
      >
        <Icon name="tabler:photo" size="12" />
        {{ album.photoCount || 0 }}
      </span>

      <!-- 悬停遮罩，提示可点击查看 -->
      <span
        class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/20 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
    </button>

    <!-- 明确的相簿信息与操作区 -->
    <div class="flex flex-1 flex-col gap-2.5 p-3">
      <div class="flex items-start justify-between gap-2">
        <button
          type="button"
          class="min-w-0 text-left"
          :title="t('dashboard.albums.card.actions.view')"
          @click="emit('view')"
        >
          <p
            class="truncate text-[15px] font-semibold leading-tight text-(--ui-text)"
          >
            {{ album.title }}
          </p>
        </button>
        <UDropdownMenu :content="{ align: 'end' }" :items="menuItems">
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="tabler:dots-vertical"
            @click.stop
          />
        </UDropdownMenu>
      </div>

      <!-- 元信息徽标：一目了然 -->
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-(--ui-text-muted)">
        <!-- 二级相簿：可折叠的计数入口 -->
        <button
          v-if="isScan && hasChildren"
          type="button"
          class="flex items-center gap-1 rounded-md bg-(--ui-bg-elevated) px-1.5 py-0.5 transition hover:bg-primary-500/10 hover:text-primary-600 dark:hover:text-primary-400"
          :title="t('dashboard.albums.table.expand')"
          @click="emit('expand')"
        >
          <Icon
            :name="expanded ? 'tabler:chevron-down' : 'tabler:chevron-right'"
            size="12"
          />
          {{ album.children?.length || 0 }}
          {{ t('dashboard.albums.subAlbums') }}
        </button>
        <span
          v-if="isScan"
          class="flex items-center gap-1 rounded-md bg-(--ui-bg-elevated) px-1.5 py-0.5"
        >
          <Icon name="tabler:book-2" size="12" />
          {{ t('dashboard.albums.table.external') }}
        </span>
        <span
          v-if="album.hasCustom"
          class="flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-amber-600 dark:text-amber-400"
        >
          <Icon name="tabler:wand" size="12" />
          {{ t('dashboard.albums.table.customized') }}
        </span>
        <span v-if="album.isHidden" class="flex items-center gap-1">
          <Icon name="tabler:eye-off" size="12" />
          {{ t('dashboard.albums.table.hidden') }}
        </span>
        <span
          v-if="album.description"
          class="truncate text-(--ui-text-dimmed)"
        >
          {{ album.description }}
        </span>
      </div>

      <!-- 常驻操作按钮：清晰可见且紧凑 -->
      <div class="mt-auto flex items-center gap-2">
        <UButton
          color="primary"
          size="xs"
          :icon="'tabler:external-link'"
          @click="emit('view')"
        >
          {{ t('dashboard.albums.card.actions.view') }}
        </UButton>
        <UButton
          variant="outline"
          color="neutral"
          size="xs"
          :icon="'tabler:pencil'"
          @click="emit('edit')"
        >
          {{ t('dashboard.albums.card.actions.edit') }}
        </UButton>
      </div>
    </div>
  </div>
</template>