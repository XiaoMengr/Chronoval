<script lang="ts" setup>
import { formatCameraInfo } from '~/utils/camera'

interface PhotoProps {
  photo?: Photo
}

const { photo } = defineProps<PhotoProps>()

const { $i18n } = useNuxtApp()
const config = useRuntimeConfig()

const siteName = computed(() => config.public.app.title || 'Chronoval')

/**
 * OG 画布复刻 Afilmory og.template.tsx 的单图模板（takumi 渲染器）。
 * 布局：135deg 深色渐变 + 48px 网格、右下 Brand、
 * PhotoFrame(10px 圆角 + 投影 + 高光) + InfoPanel(标题/标签/cam/exif/日期/琥珀强调条)。
 */

const title = computed(() =>
  (photo?.title || $i18n.t('title.fallback.photo')).slice(0, 60),
)

const camera = computed(() =>
  photo && photo.exif ? formatCameraInfo(photo.exif.Make, photo.exif.Model) : null,
)

const formattedDate = computed(() => {
  if (!photo?.dateTaken) return undefined
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(photo.dateTaken))
})

const thumbnailUrl = computed(() =>
  photo?.thumbnailKey && photo.thumbnailUrl
    ? `/thumb/${encodeURIComponent(photo.thumbnailUrl)}`
    : undefined,
)

/* ---------------- 布局（原样移植 Afilmory determineLayout） ---------------- */
const CANVAS = { width: 1200, height: 628 }
const ogAspect = CANVAS.width / CANVAS.height

function determineLayout(aspect: number) {
  let finalAspect = aspect
  if (!Number.isFinite(finalAspect) || finalAspect <= 0) finalAspect = 1
  if (finalAspect < 0.9) {
    const padding = 60
    return { arrangement: 'split' as const, padding, gap: 44, infoCompact: false, photoFit: 'cover' as const, boxW: CANVAS.width * 0.44, boxH: CANVAS.height - padding * 2 }
  }
  if (finalAspect <= 1.1) {
    const padding = 60
    return { arrangement: 'split' as const, padding, gap: 44, infoCompact: false, photoFit: 'cover' as const, boxW: CANVAS.width * 0.5, boxH: CANVAS.height - padding * 2 }
  }
  if (finalAspect >= 2.35) {
    const padding = 50
    return { arrangement: 'wide' as const, padding, gap: 28, infoCompact: true, photoFit: 'contain' as const, boxW: CANVAS.width - padding * 2, boxH: 340 }
  }
  const padding = 54
  const arrangement = finalAspect / ogAspect <= 0.82 ? ('split' as const) : ('stack' as const)
  return { arrangement, padding, gap: 26, infoCompact: false, photoFit: 'cover' as const, boxW: CANVAS.width - padding * 2, boxH: 410 }
}

const photoWidth = (photo?.width || 0) > 0 ? photo!.width! : 1
const photoHeight = (photo?.height || 0) > 0 ? photo!.height! : 1
const layout = determineLayout(photoWidth / photoHeight)

let w = layout.boxW
let h = w / (photoWidth / photoHeight)
if (h > layout.boxH) {
  h = layout.boxH
  w = h * (photoWidth / photoHeight)
}
const photoSize = { width: Math.round(w), height: Math.round(h) }

const exifItems: Array<{ label: string; text: string }> = []
if (photo?.exif?.FNumber != null) exifItems.push({ label: 'f', text: String(photo.exif.FNumber) })
if (photo?.exif?.ExposureTime != null) exifItems.push({ label: 's', text: String(photo.exif.ExposureTime) })
if (photo?.exif?.ISO != null) exifItems.push({ label: 'iso', text: String(photo.exif.ISO) })
if (photo?.exif?.FocalLengthIn35mmFormat) exifItems.push({ label: 'mm', text: String(photo.exif.FocalLengthIn35mmFormat) })

const tags = (photo?.tags || []).slice(0, layout.infoCompact ? 2 : 3)
const compact = layout.infoCompact
const scale = compact ? 0.8 : 1
const isSplit = layout.arrangement === 'split'

/* ---- 供模板使用的动态样式串（单值绑定，符合 takumi 语法） ---- */
const canvasPad = `${layout.padding}px`
const gapPx = `${layout.gap}px`
const photoW = `${photoSize.width}px`
const photoH = `${photoSize.height}px`
const infoGap = compact ? '12px' : '16px'
const exifGap = compact ? '12px' : '18px'
const tagFont = `${13 * scale}px`
const tagPad = `${compact ? 4 : 6}px ${compact ? 12 : 14}px`
const camFont = `${15 * scale}px`
const exifFont = `${14 * scale}px`
const exifLabelFont = `${10 * scale}px`
const dateFont = `${13 * scale}px`
const accentW = compact ? '50px' : '80px'
const whiteText = 'rgba(255,255,255,0.75)'
</script>

<template>
  <div class="og-canvas" :style="{ padding: canvasPad }">
    <!-- 48px 网格纹理 -->
    <div class="og-grid" />

    <!-- 右下 Brand -->
    <div class="og-brand">{{ siteName }}</div>

    <div class="relative flex h-full w-full">
      <!-- Split：照片左、信息右 -->
      <div
        v-if="isSplit"
        class="flex h-full w-full flex-row items-center"
        :style="{ gap: gapPx }"
      >
        <div class="flex shrink-0">
          <div class="og-photo-frame" :style="{ width: photoW, height: photoH }">
            <img
              v-if="thumbnailUrl"
              :src="thumbnailUrl"
              :class="layout.photoFit === 'cover' ? 'og-img-cover' : 'og-img-contain'"
            />
            <span v-else class="og-nopreview">No Preview</span>
            <div class="og-highlight" />
          </div>
        </div>

        <div class="flex h-full min-w-0 items-center">
          <div class="flex w-full flex-col text-white" :style="{ gap: infoGap }">
            <h1 class="og-title">{{ title }}</h1>

            <div v-if="tags.length" class="flex flex-wrap" :style="{ gap: '8px' }">
              <div
                v-for="tag in tags"
                :key="tag"
                class="og-tag"
                :style="{ fontSize: tagFont, padding: tagPad }"
              >
                #{{ tag }}
              </div>
            </div>

            <div v-if="camera" class="og-camera" :style="{ fontSize: camFont }">
              <span class="og-cam-label">cam</span>
              <span>{{ camera }}</span>
            </div>

            <div v-if="exifItems.length" class="flex flex-wrap" :style="{ gap: exifGap }">
              <div v-for="item in exifItems" :key="item.label + item.text" class="flex items-center" :style="{ gap: '4px' }">
                <span class="og-exif-label" :style="{ fontSize: exifLabelFont }">{{ item.label }}</span>
                <span :style="{ color: whiteText, fontSize: exifFont }">{{ item.text }}</span>
              </div>
            </div>

            <div v-if="formattedDate" class="og-date" :style="{ fontSize: dateFont }">
              {{ formattedDate }}
            </div>

            <div class="og-accent" :style="{ width: accentW }" />
          </div>
        </div>
      </div>

      <!-- Stack / Wide：照片上、信息下 -->
      <div
        v-else
        class="flex h-full w-full flex-col items-center justify-start"
        :style="{ gap: gapPx }"
      >
        <div class="flex shrink-0 justify-center">
          <div class="og-photo-frame" :style="{ width: photoW, height: photoH }">
            <img
              v-if="thumbnailUrl"
              :src="thumbnailUrl"
              :class="layout.photoFit === 'cover' ? 'og-img-cover' : 'og-img-contain'"
            />
            <span v-else class="og-nopreview">No Preview</span>
            <div class="og-highlight" />
          </div>
        </div>

        <div class="flex shrink-0" :style="{ width: '100%', maxWidth: photoW }">
          <div class="flex w-full flex-col text-white" :style="{ gap: infoGap }">
            <h1 class="og-title">{{ title }}</h1>

            <div v-if="tags.length" class="flex flex-wrap" :style="{ gap: '8px' }">
              <div
                v-for="tag in tags"
                :key="tag"
                class="og-tag"
                :style="{ fontSize: tagFont, padding: tagPad }"
              >
                #{{ tag }}
              </div>
            </div>

            <div v-if="camera" class="og-camera" :style="{ fontSize: camFont }">
              <span class="og-cam-label">cam</span>
              <span>{{ camera }}</span>
            </div>

            <div v-if="exifItems.length" class="flex flex-wrap" :style="{ gap: exifGap }">
              <div v-for="item in exifItems" :key="item.label + item.text" class="flex items-center" :style="{ gap: '4px' }">
                <span class="og-exif-label" :style="{ fontSize: exifLabelFont }">{{ item.label }}</span>
                <span :style="{ color: whiteText, fontSize: exifFont }">{{ item.text }}</span>
              </div>
            </div>

            <div v-if="formattedDate" class="og-date" :style="{ fontSize: dateFont }">
              {{ formattedDate }}
            </div>

            <div class="og-accent" :style="{ width: accentW }" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.og-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  box-sizing: border-box;
  overflow: hidden;
  background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%);
  font-family: "Rubik", "Noto Sans SC", system-ui, -apple-system, sans-serif;
}

.og-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0.02;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
  background-size: 48px 48px;
}

.og-brand {
  position: absolute;
  bottom: 32px;
  right: 32px;
  font-size: 20px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.68);
  letter-spacing: 0.5px;
}

.og-photo-frame {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
  background-color: #050505;
  display: flex;
}

.og-img-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.og-img-contain {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.og-nopreview {
  margin: auto;
  color: rgba(255, 255, 255, 0.35);
  font-size: 14px;
  letter-spacing: 0.3px;
}

.og-highlight {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, transparent 50%);
}

.og-title {
  margin: 0;
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.5px;
  line-height: 1.25;
}

.og-tag {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.9);
  background-color: rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  letter-spacing: 0.2px;
}

.og-camera {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.7);
}

.og-cam-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.og-exif-label {
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.2px;
  text-transform: uppercase;
}

.og-date {
  color: rgba(255, 255, 255, 0.45);
  margin-top: 6px;
}

.og-accent {
  height: 3px;
  background: #fbbf24;
  border-radius: 2px;
}
</style>