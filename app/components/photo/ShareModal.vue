<script lang="ts" setup>
import { motion, AnimatePresence } from 'motion-v'

interface Props {
  isOpen: boolean
  photo: Photo
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const toast = useToast()
const { gtag } = useGtag()

/**
 * Origin of the running app (used to build the share URL and embed script).
 */
const baseUrl = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
})

const shareUrl = computed(() => {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/${props.photo.id}`
  }
  return ''
})

const shareText = computed(() => {
  const title = props.photo.title || $t('ui.action.share.fallback.photoTitle')
  const description = props.photo.description || ''
  return `${$t('ui.action.share.text.prefix')} ${title}${description ? ' - ' + description : ''}`
})

const shareTextAndUrl = computed(() => {
  return `${shareText.value}\n${shareUrl.value}`
})

/**
 * Copy-paste embed snippet, following the Afilmory embed format:
 * Uses a script element with "async" and a "data-afilmory-photo" attribute
 * plus "data-aspect" and "data-width" attributes, pointing to /share/embed.js.
 */
const embedCode = computed(() => {
  const base = baseUrl.value || ''
  const aspect =
    props.photo.width && props.photo.height
      ? `${props.photo.width}:${props.photo.height}`
      : '4:3'
  return `<script async src="${base}/share/embed.js" data-afilmory-photo="${props.photo.id}" data-aspect="${aspect}" data-width="100%"><\/script>`
})

// OG Image URL and loading state
const ogImageLoading = ref(true)
const ogImageError = ref(false)
const loadingTimer = ref<NodeJS.Timeout | null>(null)
const ogImageUrl = computed(() => `/_og/r/${props.photo.id}.png`)

// Reset loading state when photo changes or modal opens
const resetLoadingState = () => {
  ogImageLoading.value = true
  ogImageError.value = false

  // Clear existing timer
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value)
  }

  // Set a timeout to handle cases where onload/onerror never fires
  loadingTimer.value = setTimeout(() => {
    if (ogImageLoading.value) {
      ogImageLoading.value = false
      ogImageError.value = true
    }
  }, 10000) // 10 second timeout
}

// Reset loading state when photo changes
watch(() => props.photo.id, resetLoadingState)

// Reset loading state when modal opens
watch(
  () => props.isOpen,
  (newValue) => {
    if (newValue) {
      resetLoadingState()
    }
  },
)

// Handle image load events
const handleOgImageLoad = () => {
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value)
    loadingTimer.value = null
  }
  ogImageLoading.value = false
  ogImageError.value = false
}

const handleOgImageError = () => {
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value)
    loadingTimer.value = null
  }
  ogImageLoading.value = false
  ogImageError.value = true
}

// Cleanup on unmount
onUnmounted(() => {
  if (loadingTimer.value) {
    clearTimeout(loadingTimer.value)
  }
})

// Social media share functions
const shareToTwitter = () => {
  // Track Twitter share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'twitter',
  })

  const text = encodeURIComponent(shareText.value)
  const url = encodeURIComponent(shareUrl.value)
  window.open(
    `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    '_blank',
  )
}

const shareToTelegram = () => {
  // Track Telegram share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'telegram',
  })

  window.open(
    `https://t.me/share/url?url=${encodeURIComponent(shareUrl.value)}&text=${encodeURIComponent(shareText.value)}`,
    '_blank',
  )
}

const shareToWeibo = () => {
  // Track Weibo share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'weibo',
  })

  const text = encodeURIComponent(shareText.value)
  const url = encodeURIComponent(shareUrl.value)
  window.open(
    `https://service.weibo.com/share/share.php?url=${url}&title=${text}`,
    '_blank',
  )
}

const shareToFacebook = () => {
  // Track Facebook share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'facebook',
  })

  const url = encodeURIComponent(shareUrl.value)
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank')
}

const shareToWhatsApp = () => {
  // Track WhatsApp share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'whatsapp',
  })

  const text = encodeURIComponent(`${shareText.value}\n${shareUrl.value}`)
  window.open(`https://wa.me/?text=${text}`, '_blank')
}

const shareToLinkedIn = () => {
  // Track LinkedIn share event in Google Analytics
  gtag('event', 'photo_share', {
    photo_id: props.photo.id,
    photo_title: props.photo.title || 'Untitled',
    share_method: 'linkedin',
  })

  const url = encodeURIComponent(shareUrl.value)
  const title = encodeURIComponent(shareText.value)
  window.open(
    `https://www.linkedin.com/sharing/share-offsite/?url=${url}&title=${title}`,
    '_blank',
  )
}

// Copy functions
const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(shareTextAndUrl.value)
    toast.add({
      title: $t('ui.action.share.success.linkCopied'),
      color: 'success',
      icon: 'tabler:check',
      duration: 3000,
    })
  } catch (error) {
    toast.add({
      title: $t('ui.action.share.error.linkCopyFailed'),
      description: (error as Error)?.message || $t('common.unknownError'),
      color: 'error',
      icon: 'tabler:x',
      duration: 3000,
    })
  }
}

// Copy the embed snippet to the clipboard
const copyEmbed = async () => {
  try {
    await navigator.clipboard.writeText(embedCode.value)
    toast.add({
      title: $t('ui.action.share.embed.copied'),
      color: 'success',
      icon: 'tabler:check',
      duration: 3000,
    })
  } catch (error) {
    toast.add({
      title: $t('ui.action.share.embed.copyFailed'),
      description: (error as Error)?.message || $t('common.unknownError'),
      color: 'error',
      icon: 'tabler:x',
      duration: 3000,
    })
  }
}

// Native share (for mobile devices). Falls back to copying the link
// when navigator.share is not available.
const nativeShare = async () => {
  // Fall back to copying the link when the Web Share API is unavailable
  if (typeof navigator === 'undefined' || !navigator.share) {
    await copyLink()
    return
  }

  try {
    // Track native share event in Google Analytics
    gtag('event', 'photo_share', {
      photo_id: props.photo.id,
      photo_title: props.photo.title || 'Untitled',
      share_method: 'native_share',
    })

    await navigator.share({
      title: shareText.value,
      url: shareUrl.value,
    })
  } catch (error) {
    console.error($t('ui.action.share.error.nativeShareFailed'), error)
  }
}

// Download OG Image
const downloadOgImage = async () => {
  try {
    const response = await fetch(ogImageUrl.value)
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${props.photo.title || 'photo'}-og.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    toast.add({
      title: $t('ui.action.share.success.ogImageDownloaded'),
      color: 'success',
      icon: 'tabler:download',
      duration: 3000,
    })
  } catch (error) {
    toast.add({
      title: $t('ui.action.share.error.ogImageDownloadFailed'),
      description: (error as Error)?.message || $t('common.unknownError'),
      color: 'error',
      icon: 'tabler:x',
      duration: 3000,
    })
  }
}

const downloadOriginalImage = async () => {
  try {
    const response = await fetch(props.photo.originalUrl!)
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const extension = props.photo.originalUrl!.split('.').pop() || 'jpg'
    link.download = `${props.photo.title || 'photo'}.${extension}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    // Track download event in Google Analytics
    gtag('event', 'photo_download', {
      photo_id: props.photo.id,
      photo_title: props.photo.title || 'Untitled',
      download_type: 'original',
    })

    toast.add({
      title: $t('ui.action.share.success.originalImageDownloaded'),
      color: 'success',
      icon: 'tabler:download',
      duration: 3000,
    })
  } catch (error) {
    toast.add({
      title: $t('ui.action.share.error.originalImageDownloadFailed'),
      description: (error as Error)?.message || $t('common.unknownError'),
      color: 'error',
      icon: 'tabler:x',
      duration: 3000,
    })
  }
}

// Check if native share is available
const canNativeShare = computed(() => {
  return typeof window !== 'undefined' && navigator.share
})

// Social media platforms data
const socialPlatforms = computed(() => [
  {
    name: $t('ui.action.share.platforms.twitter'),
    icon: 'tabler:brand-twitter',
    color: 'text-blue-500',
    action: shareToTwitter,
  },
  {
    name: $t('ui.action.share.platforms.telegram'),
    icon: 'tabler:brand-telegram',
    color: 'text-blue-400',
    action: shareToTelegram,
  },
  {
    name: $t('ui.action.share.platforms.weibo'),
    icon: 'tabler:brand-weibo',
    color: 'text-red-500',
    action: shareToWeibo,
  },
  {
    name: $t('ui.action.share.platforms.facebook'),
    icon: 'tabler:brand-facebook',
    color: 'text-blue-600',
    action: shareToFacebook,
  },
  {
    name: $t('ui.action.share.platforms.whatsapp'),
    icon: 'tabler:brand-whatsapp',
    color: 'text-green-500',
    action: shareToWhatsApp,
  },
  {
    name: $t('ui.action.share.platforms.linkedin'),
    icon: 'tabler:brand-linkedin',
    color: 'text-blue-700',
    action: shareToLinkedIn,
  },
])

// Close modal when clicking outside
const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}

// Keyboard shortcuts
defineShortcuts({
  escape: () => {
    emit('close')
  },
})
</script>

<template>
  <Teleport to="body">
    <AnimatePresence>
      <motion.div
        v-if="isOpen"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.2 }"
        class="fixed inset-0 z-60 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
        @click="handleBackdropClick"
      >
        <motion.div
          :initial="{ opacity: 0, scale: 0.95, y: 20 }"
          :animate="{ opacity: 1, scale: 1, y: 0 }"
          :exit="{ opacity: 0, scale: 0.95, y: 20 }"
          :transition="{
            type: 'spring',
            duration: 0.3,
            bounce: 0.1,
          }"
          class="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-black/70 shadow-2xl backdrop-blur-2xl"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-white/10 bg-white/5 p-4">
            <div class="flex items-center gap-2">
              <Icon
                name="tabler:share-3"
                class="size-5 text-white/70"
              />
              <h3 class="text-lg font-semibold text-white/90">
                {{ $t('ui.action.share.title') }}
              </h3>
            </div>
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              class="text-white/70"
              icon="tabler:x"
              @click="emit('close')"
            />
          </div>

          <!-- Content -->
          <div
            v-if="photo"
            class="max-h-[70vh] space-y-4 overflow-y-auto p-4"
          >
            <!-- Native Share (Mobile) & Download Original -->
            <div
              v-if="canNativeShare"
              class="flex flex-col gap-2"
            >
              <button
                type="button"
                class="glassmorphic-btn flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-sm font-medium text-white/80 transition-all hover:border-white/20 hover:bg-white/8 hover:text-white"
                @click="nativeShare"
              >
                <Icon name="tabler:share-2" class="size-4" />
                {{ $t('ui.action.share.actions.nativeShare') }}
              </button>
              <button
                type="button"
                class="glassmorphic-btn flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-sm font-medium text-white/80 transition-all hover:border-white/20 hover:bg-white/8 hover:text-white"
                @click="downloadOriginalImage"
              >
                <Icon name="tabler:download" class="size-4" />
                {{ $t('ui.action.share.actions.downloadOriginalImage') }}
              </button>
            </div>

            <!-- Share URL -->
            <section class="rounded-xl border border-white/10 bg-white/5 p-3">
              <label class="mb-1 block text-xs font-medium text-white/40">
                {{ $t('ui.action.share.actions.shareUrl') }}
              </label>
              <div class="flex items-center gap-2">
                <input
                  :value="shareUrl"
                  readonly
                  class="flex-1 resize-none truncate bg-transparent text-sm text-white/90"
                />
                <button
                  type="button"
                  class="glassmorphic-btn shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/5 p-2 text-white/80 transition-all hover:border-white/20 hover:bg-white/8 hover:text-white"
                  :title="$t('ui.action.share.actions.copyLink')"
                  @click="copyLink"
                >
                  <Icon name="tabler:copy" class="size-4" />
                </button>
              </div>
            </section>

            <!-- Embed Code -->
            <section class="rounded-xl border border-white/10 bg-white/5 p-3">
              <div class="mb-1 flex items-center justify-between">
                <label class="block text-xs font-medium text-white/40">
                  {{ $t('ui.action.share.embed.title') }}
                </label>
                <button
                  type="button"
                  class="glassmorphic-btn flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 transition-all hover:border-white/20 hover:bg-white/8 hover:text-white"
                  @click="copyEmbed"
                >
                  <Icon name="tabler:code" class="size-3.5" />
                  {{ $t('ui.action.share.embed.copy') }}
                </button>
              </div>
              <p class="mb-2 text-xs text-white/40">
                {{ $t('ui.action.share.embed.description') }}
              </p>
              <pre class="overflow-x-auto rounded-md bg-black/40 p-2 text-xs leading-relaxed text-white/70"><code>{{ embedCode }}</code></pre>
            </section>

            <!-- OG Image Preview -->
            <section class="rounded-xl border border-white/10 bg-white/5 p-3">
              <div class="mb-2 flex items-center justify-between">
                <label class="block text-xs font-medium text-white/40">
                  {{ $t('ui.action.share.ogImage.title') }}
                </label>
                <button
                  type="button"
                  class="glassmorphic-btn flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 transition-all hover:border-white/20 hover:bg-white/8 hover:text-white"
                  @click="downloadOgImage"
                >
                  <Icon name="tabler:download" class="size-3.5" />
                  {{ $t('ui.action.share.actions.downloadOgImage') }}
                </button>
              </div>
              <div class="relative overflow-hidden rounded-md bg-white/5">
                <!-- Loading indicator -->
                <div
                  v-if="ogImageLoading"
                  class="flex aspect-2/1 items-center justify-center bg-white/5"
                >
                  <div class="flex flex-col items-center gap-2">
                    <Icon
                      name="tabler:loader-2"
                      class="size-6 animate-spin text-white/50"
                    />
                    <span class="text-xs text-white/40">
                      {{ $t('ui.action.share.ogImage.loading') }}
                    </span>
                  </div>
                </div>

                <!-- Error state -->
                <div
                  v-else-if="ogImageError"
                  class="flex aspect-2/1 items-center justify-center bg-white/5"
                >
                  <div class="flex flex-col items-center gap-2">
                    <Icon
                      name="tabler:photo-off"
                      class="size-6 text-white/40"
                    />
                    <span class="text-xs text-white/40">
                      {{ $t('ui.action.share.ogImage.loadError') }}
                    </span>
                  </div>
                </div>

                <!-- OG Image -->
                <img
                  v-show="!ogImageLoading && !ogImageError"
                  :key="`og-image-${props.photo.id}-${Date.now()}`"
                  :src="ogImageUrl"
                  :alt="$t('ui.action.share.ogImage.alt')"
                  class="aspect-2/1 w-full rounded object-cover"
                  loading="eager"
                  @load="handleOgImageLoad"
                  @error="handleOgImageError"
                />
              </div>
            </section>

            <!-- Social Platforms Grid -->
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="platform in socialPlatforms"
                :key="platform.name"
                type="button"
                class="glassmorphic-btn group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-white/80 transition-all hover:border-white/20 hover:bg-white/8 hover:text-white"
                @click="platform.action"
              >
                <Icon
                  :name="platform.icon"
                  class="size-5 transition-colors group-hover:text-white"
                />
                <span class="text-xs font-medium">
                  {{ platform.name }}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  </Teleport>
</template>

<style scoped></style>