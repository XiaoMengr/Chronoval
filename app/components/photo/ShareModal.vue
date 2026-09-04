<script lang="ts" setup>
import { motion, AnimatePresence } from 'motion-v'

interface Props {
  isOpen: boolean
  photo: Photo
  /** 原始图 blob URL，用于原生分享直接附带文件（可选） */
  blobSrc?: string
}

const props = withDefaults(defineProps<Props>(), {
  blobSrc: '',
})
const emit = defineEmits<{
  close: []
}>()

const toast = useToast()
const { gtag } = useGtag()

// OG 预览图比例 1200:628（与原版一致）
const OG_ASPECT = 1200 / 628

const resolvedBaseUrl = computed(() =>
  typeof window !== 'undefined' ? window.location.origin : '',
)

const shareUrl = computed(() => {
  const base = resolvedBaseUrl.value || ''
  return `${base}/${props.photo.id}`
})

const shareTitle = computed(
  () => props.photo.title || $t('ui.action.share.fallback.photoTitle'),
)

const shareText = computed(() => {
  const prefix = $t('ui.action.share.text.prefix')
  const desc = props.photo.description ? ` - ${props.photo.description}` : ''
  return `${prefix} ${shareTitle.value}${desc}`
})
const shareTextAndUrl = computed(() => `${shareText.value}\n${shareUrl.value}`)

const canEmbed = computed(() => true)

const embedCode = computed(() => {
  const base = resolvedBaseUrl.value || ''
  const aspect =
    props.photo.width && props.photo.height
      ? `${props.photo.width}:${props.photo.height}`
      : '4:3'
  return `<script async src="${base}/share/embed.js" data-afilmory-photo="${props.photo.id}" data-aspect="${aspect}" data-width="100%"><\/script>`
})

const ogPreviewUrl = computed(
  () => `${resolvedBaseUrl.value || ''}/_og/r/${props.photo.id}.png?v=1`,
)

/* ---------------- OG 预览加载态 ---------------- */
const ogImageLoading = ref(true)
const ogImageError = ref(false)
let loadTimer: ReturnType<typeof setTimeout> | null = null

const resetOgState = () => {
  ogImageLoading.value = true
  ogImageError.value = false
  if (loadTimer) clearTimeout(loadTimer)
  loadTimer = setTimeout(() => {
    if (ogImageLoading.value) {
      ogImageLoading.value = false
      ogImageError.value = true
    }
  }, 10000)
}

watch(() => props.photo.id, resetOgState)
watch(() => props.isOpen, (v) => { if (v) resetOgState() })

const handleOgLoad = () => {
  if (loadTimer) clearTimeout(loadTimer)
  ogImageLoading.value = false
  ogImageError.value = false
}
const handleOgError = () => {
  if (loadTimer) clearTimeout(loadTimer)
  ogImageLoading.value = false
  ogImageError.value = true
}
onUnmounted(() => { if (loadTimer) clearTimeout(loadTimer) })

/* ---------------- 下载工具 ---------------- */
// 校验字节是否为常见图片格式（PNG/JPEG/WebP/GIF）。
// OG 预览端点（/_og/r/**）在按需渲染失败时可能返回 HTML/错误页却带 2xx，需据此兜掉。
function isImageBytes(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 12) return false
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true
  // WebP: 'RIFF' .... 'WEBP'
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return true
  // GIF: 'GIF8'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true
  return false
}

async function downloadFile(url: string, filename: string) {
  // 25s 超时：OG 端点在服务端按需渲染大图时可能较慢/超时，避免无响应挂起
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    const res = await fetch(url, { credentials: 'same-origin', signal: controller.signal })
    if (!res.ok) throw new Error('Unable to download file')
    const blob = await res.blob()
    if (blob.size === 0) throw new Error('Empty download')
    // OG 端点可能把渲染报错以 HTML/2xx 返回，这里按签名校验，非图片则视为失败
    const contentType = res.headers.get('content-type') || ''
    if (
      !contentType.includes('image/') &&
      !isImageBytes(await blob.arrayBuffer().catch(() => new ArrayBuffer(0)))
    ) {
      throw new Error('Response is not an image')
    }
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(blobUrl)
  } finally {
    clearTimeout(timer)
  }
}

const isDownloadingOriginal = ref(false)
const isDownloadingPreview = ref(false)
const canUseNativeShare = !!(
  typeof navigator !== 'undefined' && typeof navigator.share === 'function'
)

const handleDownloadOriginal = async () => {
  try {
    isDownloadingOriginal.value = true
    await downloadFile(props.photo.originalUrl!, `${props.photo.id}.jpg`)
    writePhotoDownload('original')
    toast.add({ title: $t('ui.action.share.success.originalImageDownloaded'), color: 'success', icon: 'tabler:check', duration: 3000 })
  } catch {
    toast.add({ title: $t('ui.action.share.error.originalImageDownloadFailed'), color: 'error', icon: 'tabler:x', duration: 3000 })
  } finally {
    isDownloadingOriginal.value = false
  }
}

const handleDownloadPreview = async () => {
  try {
    isDownloadingPreview.value = true
    // 优先下载 OG 社交预览图；OG 端点在服务端按需渲染大图时可能失败/超时，
    // 失败时回退到直接下载原图，保证「预览」按钮始终能拿到文件。
    try {
      await downloadFile(ogPreviewUrl.value, `${props.photo.id}-og.png`)
      writePhotoDownload('og')
      toast.add({ title: $t('ui.action.share.success.ogImageDownloaded'), color: 'success', icon: 'tabler:check', duration: 3000 })
      return
    } catch {
      if (!props.photo.originalUrl) throw new Error('No original')
    }
    await downloadFile(props.photo.originalUrl!, `${props.photo.id}-og.jpg`)
    writePhotoDownload('og')
    toast.add({ title: $t('ui.action.share.success.ogImageDownloaded'), color: 'success', icon: 'tabler:check', duration: 3000 })
  } catch {
    toast.add({ title: $t('ui.action.share.error.ogImageDownloadFailed'), color: 'error', icon: 'tabler:x', duration: 3000 })
  } finally {
    isDownloadingPreview.value = false
  }
}

const writePhotoDownload = (type: string) => {
  gtag('event', 'photo_download', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    download_type: type,
  })
}

/* ---------------- 复制（带 copied↔check 动画） ---------------- */
const isCopying = ref(false)
const isCopied = ref(false)
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

const copyText = async (text: string, successKey: string) => {
  try {
    await navigator.clipboard.writeText(text)
    isCopying.value = true
    isCopied.value = true
    if (copyResetTimer) clearTimeout(copyResetTimer)
    copyResetTimer = setTimeout(() => { isCopied.value = false; isCopying.value = false }, 1000)
    toast.add({ title: $t(successKey), color: 'success', icon: 'tabler:check', duration: 2000 })
  } catch {
    toast.add({ title: $t('ui.action.share.error.linkCopyFailed'), color: 'error', icon: 'tabler:x', duration: 3000 })
  }
}

const handleCopyLink = () => copyText(shareUrl.value, 'ui.action.share.success.linkCopied')
const handleCopyEmbed = () => copyText(embedCode.value, 'ui.action.share.embed.copied')

/* ---------------- 原生分享（带文件，失败退回复制链接） ---------------- */
const handleNativeShare = async () => {
  if (!canUseNativeShare) return
  try {
    const files = await buildShareFiles(props.photo, props.blobSrc)
    await navigator.share({
      title: shareTitle.value,
      text: shareText.value,
      url: shareUrl.value,
      ...(files.length > 0 ? { files } as any : {}),
    })
    emit('close')
  } catch {
    await handleCopyLink()
    emit('close')
  }
}

async function buildShareFiles(photo: Photo, blobSrc?: string): Promise<File[]> {
  const imageUrl = blobSrc || photo.originalUrl
  try {
    const res = await fetch(imageUrl)
    const blob = await res.blob()
    return [new File([blob], `${photo.title || photo.id}.jpg`, { type: blob.type || 'image/jpeg' })]
  } catch {
    return []
  }
}

/* ---------------- 社交分享 ---------------- */
const handleSocialShare = (urlTemplate: string) => {
  gtag('event', 'photo_share', { photo_id: props.photo.id, share_method: 'social' })
  const encodedUrl = encodeURIComponent(shareUrl.value)
  const encodedTitle = encodeURIComponent(shareTitle.value)
  const encodedText = encodeURIComponent(shareTextAndUrl.value)
  const finalUrl = urlTemplate
    .replace('{url}', encodedUrl)
    .replace('{title}', encodedTitle)
    .replace('{text}', encodedText)
  window.open(finalUrl, '_blank', 'width=600,height=600')
  emit('close')
}

interface SocialOption {
  id: string
  label: string
  icon: string
  url: string
}

const socialOptions = computed<SocialOption[]>(() => [
  {
    id: 'twitter',
    label: 'Twitter',
    icon: 'tabler:brand-twitter',
    url: 'https://twitter.com/intent/tweet?text={text}&url={url}',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: 'tabler:brand-telegram',
    url: 'https://t.me/share/url?url={url}&text={text}',
  },
  {
    id: 'weibo',
    label: $t('ui.action.share.platforms.weibo'),
    icon: 'tabler:brand-weibo',
    url: 'https://service.weibo.com/share/share.php?url={url}&title={text}',
  },
])

/* 操作按钮行：逐项渲染，不再使用网格 */

// Esc 关闭
defineShortcuts({ escape: () => emit('close') })
onUnmounted(() => { if (copyResetTimer) clearTimeout(copyResetTimer) })
</script>

<template>
  <Teleport to="body">
    <AnimatePresence>
      <motion.div
        v-if="isOpen"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.18, ease: 'easeOut' }"
        class="share-scrim fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
        @click="emit('close')"
      >
        <motion.div
          :initial="{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }"
          :animate="{ opacity: 1, scale: 1, filter: 'blur(0px)' }"
          :exit="{ opacity: 0, scale: 0.98, filter: 'blur(6px)' }"
          :transition="{ type: 'spring', duration: 0.32, bounce: 0.12 }"
          class="glass-surface share-surface fixed left-1/2 top-1/2 z-[70] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-2xl"
          @click.stop
        >
          <!-- 顶部发丝高光线 + 氛围辉光（中性色调，随明暗自适应） -->
          <div
            class="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-(--glass-border) to-transparent"
          />
          <div
            class="pointer-events-none absolute -top-12 left-1/2 h-16 w-1/2 -translate-x-1/2 rounded-full bg-(--glass-text) opacity-[0.06] blur-3xl"
          />

          <!-- 头部：琥珀标记 + 标题 + 位置 + 关闭 -->
          <div class="mb-4 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="size-1.5 shrink-0 rounded-full bg-(--glass-muted)" />
                <p class="text-[11px] font-semibold uppercase tracking-widest text-(--glass-muted)">
                  {{ $t('ui.action.share.title') }}
                </p>
              </div>
              <h2 class="mt-1.5 truncate text-base font-semibold text-(--glass-text)">
                {{ shareTitle }}
              </h2>
              <p
                v-if="photo.locationName || photo.city"
                class="mt-0.5 truncate text-xs text-(--glass-faint)"
              >
                {{ photo.locationName || photo.city }}
              </p>
            </div>
            <button
              type="button"
              class="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-(--glass-border) bg-(--glass-chip) text-(--glass-muted) transition-all duration-200 hover:bg-(--glass-hover) hover:text-(--glass-text)"
              :aria-label="$t('ui.action.share.title')"
              @click="emit('close')"
            >
              <Icon name="tabler:x" class="size-4" />
            </button>
          </div>

          <!-- 分享链接 -->
          <div class="mb-4">
            <div
              class="flex items-center gap-2 rounded-xl border border-(--glass-border) bg-(--glass-chip) py-1.5 pr-1.5 pl-3"
            >
              <span class="flex-1 truncate text-xs text-(--glass-muted)">{{ shareUrl }}</span>
              <button
                type="button"
                class="shrink-0 rounded-lg bg-(--glass-chip) p-1.5 text-(--glass-text) transition-all duration-300 hover:bg-(--glass-hover)"
                :title="$t('ui.action.share.actions.shareUrl')"
                :disabled="isCopying || isCopied"
                @click="handleCopyLink"
              >
                <div class="relative size-4">
                  <Icon
                    name="tabler:copy"
                    class="absolute inset-0 size-4 transition-all duration-300"
                    :class="isCopied ? 'scale-0 opacity-0' : 'scale-100 opacity-100'"
                  />
                  <Icon
                    name="tabler:check"
                    class="absolute inset-0 size-4 transition-all duration-300"
                    :class="isCopied ? 'scale-100 opacity-100' : 'scale-0 opacity-0'"
                  />
                </div>
              </button>
            </div>
          </div>

          <!-- OG 预览 -->
          <div class="mb-4">
            <p class="mb-2 text-[11px] font-medium tracking-wide text-(--glass-muted)">
              {{ $t('ui.action.share.ogImage.title') }}
            </p>
            <div
              class="relative overflow-hidden rounded-xl border border-(--glass-border) bg-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <div :style="{ aspectRatio: String(OG_ASPECT), width: '100%' }">
                <template v-if="ogImageLoading">
                  <div class="absolute inset-0 flex items-center justify-center bg-(--glass-chip)">
                    <div
                      class="size-8 animate-spin rounded-full border-2 border-(--glass-border) border-t-(--glass-text)"
                    />
                  </div>
                </template>
                <img
                  :src="ogPreviewUrl"
                  :alt="shareTitle"
                  class="size-full object-cover transition-opacity duration-300"
                  :class="ogImageLoading ? 'opacity-0' : 'opacity-100'"
                  loading="lazy"
                  @load="handleOgLoad"
                  @error="handleOgError"
                />
              </div>
            </div>
          </div>

          <!-- 分享与工具 -->
          <div class="space-y-3 border-t border-(--glass-border) pt-3.5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="mr-1 text-[11px] font-medium tracking-wide text-(--glass-faint)">
                {{ $t('ui.action.share.tabs.social') }}
              </span>

              <!-- 原生分享（可用时） -->
              <button
                v-if="canUseNativeShare"
                type="button"
                class="flex size-9 cursor-pointer items-center justify-center rounded-full border border-(--glass-border) bg-(--glass-chip) text-(--glass-muted) transition-all duration-200 hover:border-(--glass-muted)/40 hover:bg-(--glass-hover) hover:text-(--glass-text)"
                :title="$t('ui.action.share.actions.nativeShare')"
                @click="handleNativeShare"
              >
                <Icon name="tabler:share-2" class="size-4.5" />
              </button>

              <!-- 社交平台 -->
              <button
                v-for="option in socialOptions"
                :key="option.id"
                type="button"
                class="flex size-9 cursor-pointer items-center justify-center rounded-full border border-(--glass-border) bg-(--glass-chip) text-(--glass-muted) transition-all duration-200 hover:border-(--glass-muted)/40 hover:bg-(--glass-hover) hover:text-(--glass-text)"
                :title="option.label"
                @click="handleSocialShare(option.url)"
              >
                <Icon :name="option.icon" class="size-4.5" />
              </button>
            </div>

            <!-- 下载 / 嵌入 -->
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-if="canEmbed"
                type="button"
                class="flex cursor-pointer items-center gap-1.5 rounded-full border border-(--glass-border) bg-(--glass-chip) px-3.5 py-1.5 text-xs font-medium text-(--glass-muted) transition-all duration-200 hover:bg-(--glass-hover) hover:text-(--glass-text)"
                :title="$t('ui.action.share.embed.description')"
                @click="handleCopyEmbed"
              >
                <Icon name="tabler:code" class="size-3.5" />
                Embed
              </button>
              <button
                type="button"
                class="flex cursor-pointer items-center gap-1.5 rounded-full border border-(--glass-border) bg-(--glass-chip) px-3.5 py-1.5 text-xs font-medium text-(--glass-muted) transition-all duration-200 hover:bg-(--glass-hover) hover:text-(--glass-text) disabled:cursor-not-allowed disabled:opacity-50"
                :title="$t('ui.action.share.actions.downloadOriginalImage')"
                :disabled="isDownloadingOriginal"
                @click="handleDownloadOriginal"
              >
                <Icon name="tabler:download" class="size-3.5" />
                {{ isDownloadingOriginal ? '…' : 'Original' }}
              </button>
              <button
                type="button"
                class="flex cursor-pointer items-center gap-1.5 rounded-full border border-(--glass-border) bg-(--glass-chip) px-3.5 py-1.5 text-xs font-medium text-(--glass-muted) transition-all duration-200 hover:bg-(--glass-hover) hover:text-(--glass-text) disabled:cursor-not-allowed disabled:opacity-50"
                :title="$t('ui.action.share.actions.downloadOgImage')"
                :disabled="isDownloadingPreview"
                @click="handleDownloadPreview"
              >
                <Icon name="tabler:photo" class="size-3.5" />
                {{ isDownloadingPreview ? '…' : 'Preview' }}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  </Teleport>
</template>

<style scoped>
/* 分享弹窗表面：比通用 glass-surface 更透明 + 更高斯模糊，营造通透的磨砂玻璃质感。
   背景纹理基于自适应的 --glass-bg（明暗自适应），透明度降到 ~72% 并加饱和强化 */
.share-surface {
  background: color-mix(in srgb, var(--glass-bg) 72%, transparent);
  backdrop-filter: blur(34px) saturate(160%);
  -webkit-backdrop-filter: blur(34px) saturate(160%);
  box-shadow:
    0 20px 50px -16px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  /* 自适应高度：不超过安全视口，纵向超限时内部滚动，避免小屏/横屏内容被截断 */
  box-sizing: border-box;
  max-height: min(90dvh, 720px);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  padding: 1rem;
}

/* 超小屏（<480px）：进一步收紧宽度与留白，让内容更紧凑地贴合手指操作区 */
@media (max-width: 480px) {
  .share-surface {
    width: calc(100% - 1.25rem);
    border-radius: 1.125rem;
    padding: 0.875rem;
  }
  /* 底部预留安全区（iPhone 横条/手势条），滚动到末尾时不被遮挡 */
  .share-surface {
    padding-bottom: calc(0.875rem + env(safe-area-inset-bottom, 0px));
  }
}

/* 中屏平板：放宽到适中宽度，兼顾可读性 */
@media (min-width: 640px) {
  .share-surface {
    max-height: min(88dvh, 760px);
  }
}

/* 浅色模式覆写：35% 白太透 + 描边太淡，在浅色/彩色背景下会发白发灰、文字沉不下去。
   改用更实的高透白底 + 清晰描边，保证可读性又保留玻璃质感 */
:global(html:not(.dark)) .share-surface {
  background: rgba(255, 255, 255, 0.82);
  border-color: rgba(15, 23, 42, 0.1);
  box-shadow:
    0 18px 40px -18px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

/* 浅色模式遮罩：避免黑色背景太重 */
.share-scrim {
  background: rgba(15, 23, 42, 0.55);
}
:global(html:not(.dark)) .share-scrim {
  background: rgba(15, 23, 42, 0.32);
}
</style>