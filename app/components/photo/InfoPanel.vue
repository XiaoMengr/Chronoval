<script setup lang="ts">
import { motion } from 'motion-v'
import type { NeededExif } from '../../../shared/types/photo'
import { analyzeToneFromImageData, type ToneAnalysis } from '~/libs/histogram'
import { formatCameraInfo, formatLensInfo } from '~/utils/camera'

interface Props {
  currentPhoto: Photo
  exifData?: NeededExif | null
  onClose?: () => void
  visible?: boolean
}

interface Album {
  id: number
  title: string
  description: string | null
  coverPhotoId: string | null
  createdAt: Date
  updatedAt: Date
}

const dayjs = useDayjs()
const router = useRouter()
const { localizeExif } = useExifLocalization()

const props = defineProps<Props>()

// 获取照片所属的相册
const { data: _albums } = useFetch<Album[]>(
  () => `/api/photos/${props.currentPhoto.id}/albums`,
  {
    watch: [() => props.currentPhoto.id],
  },
)

const albums = computed(() => _albums.value || [])

const isMobile = useMediaQuery('(max-width: 768px)')

// ===== 移动端底部弹层（抖音长按式信息卡）：
// - 打开呈现在约 50% 高度（封面/上半部分）；整卡可上滑拉伸到「满卡高度」（约 92%，接近全屏）。
// - 拉满卡之前内容区锁定（overflow-hidden），手势只用于拉伸/收矮卡片本身；
//   只有上滑到「满卡高度」后，内容区才切换为内部滚动（overflow-y-auto），
//   才能继续往下查看底部信息（含地理位置小地图）——即「先拉满卡、再滑内容」的两段式交互。
// - 满卡高度下，下拉顶部把手区域仍可把卡片收矮/关闭；内容区则交给原生内部滚动。
const PEEK_H = () => Math.round(window.innerHeight * 0.5)
const FULL_H = () => Math.round(window.innerHeight * 0.92)
const sheetHeight = ref(0)
const dragActive = ref(false)
let dragStartY = 0
let dragStartHeight = 0

// 是否已把卡片拉伸到「满卡高度」（到达后才允许内容区内部滚动）
const sheetAtMax = computed(
  () => isMobile.value && sheetHeight.value >= FULL_H() - 2,
)

const sheetStyle = computed(() =>
  isMobile.value
    ? {
        height: `${sheetHeight.value}px`,
        transition: dragActive.value
          ? 'none'
          : 'height 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
      }
    : {},
)

// 面板被打开/关闭时复位到「半高」起始位置（关闭即隐藏、重开回到 50%）
watch(
  () => props.visible,
  (v) => {
    if (isMobile.value && v) sheetHeight.value = PEEK_H()
  },
)

// 整张卡片在「未拉满」前任意位置可上滑撑高/下拉收矮（区别于仅中间白线可拖）：
// 用窗口级 pointer 监听；拉满后内容区改由内部滚动接管（见内容区 touch-action）。
// allowAtMax=true 表示手势来自顶部把手区域：即使已拉满，也可继续收矮/关闭卡片。
function onSheetDown(e: PointerEvent, allowAtMax = false) {
  if (!isMobile.value || !props.visible) return
  if (sheetAtMax.value && !allowAtMax) return
  dragStartY = e.clientY
  dragStartHeight = sheetHeight.value
  dragActive.value = false
  window.addEventListener('pointermove', onSheetMove)
  window.addEventListener('pointerup', onSheetUp)
  window.addEventListener('pointercancel', onSheetUp)
}

function onSheetMove(e: PointerEvent) {
  if (!isMobile.value) return
  const dy = e.clientY - dragStartY
  // 小于阈值视为“点按”，不占用（内部按钮/链接的 click 正常触发）
  if (!dragActive.value && Math.abs(dy) < 8) return
  dragActive.value = true
  const next = dragStartHeight - dy
  sheetHeight.value = Math.max(0, Math.min(FULL_H(), next))
}

function onSheetUp() {
  if (!isMobile.value) return
  window.removeEventListener('pointermove', onSheetMove)
  window.removeEventListener('pointerup', onSheetUp)
  window.removeEventListener('pointercancel', onSheetUp)
  if (!dragActive.value) return
  dragActive.value = false
  const PEEK = PEEK_H()
  if (sheetHeight.value < PEEK * 0.6) {
    // 下滑到最低：自动隐藏，只能通过左上角信息按钮重新展开
    props.onClose?.()
  } else {
    sheetHeight.value =
      sheetHeight.value >= (PEEK + FULL_H()) / 2 ? FULL_H() : PEEK
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onSheetMove)
  window.removeEventListener('pointerup', onSheetUp)
  window.removeEventListener('pointercancel', onSheetUp)
})

// 面板显隐由 visible 驱动（常驻挂载预热数据，仅切换可见性/位置）。
// iOS 式出现动画：translate + 轻微 scale（0.98→1）淡入，形成「推开卡片」的层次与柔感；
// 弹簧带轻微回弹（欠阻尼）起步快、收尾顺滑。
const SHEET_SPRING = {
  type: 'spring',
  stiffness: 430,
  damping: 36,
  mass: 1,
} as const

const motionPanel = computed(() => {
  if (!props.visible)
    return isMobile.value
      ? { opacity: 0, y: '106%', scale: 0.98 }
      : { opacity: 0, x: '72%', scale: 0.96 }
  return { opacity: 1, x: 0, y: 0, scale: 1 }
})

// ===== 格式化辅助（与 afilmory formatExifData 对齐） =====

// 曝光时间 -> 友好分数
const formatExposureTime = (
  exposureTime: string | number | undefined,
): string | null => {
  if (!exposureTime) return null
  let seconds: number
  if (typeof exposureTime === 'string' && exposureTime.includes('/')) {
    const parts = exposureTime.split('/')
    if (parts.length === 2 && parts[0] && parts[1]) {
      const numerator = parseFloat(parts[0])
      const denominator = parseFloat(parts[1])
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        seconds = numerator / denominator
      } else {
        return `${exposureTime}s`
      }
    } else {
      return `${exposureTime}s`
    }
  } else {
    seconds = typeof exposureTime === 'string' ? parseFloat(exposureTime) : exposureTime
  }

  if (seconds >= 1) {
    return `${seconds}s`
  }
  return `1/${Math.round(1 / seconds)}s`
}

// 文件格式：从 storageKey / title 推断扩展名
const photoFormat = computed(() => {
  const key = props.currentPhoto.storageKey
    || props.currentPhoto.title
  const ext = key?.split('.')?.pop()?.toUpperCase()
  return ext && ext.length <= 5 ? ext : (props.currentPhoto.type === 'video' ? 'VIDEO' : null)
})

const megaPixels = computed<string | null>(() => {
  if (!props.currentPhoto.height || !props.currentPhoto.width) return null
  return (((props.currentPhoto.height * props.currentPhoto.width) / 1_000_000) | 0).toString()
})

const fileSizeMB = computed(() => {
  if (!props.currentPhoto.fileSize) return null
  return `${(props.currentPhoto.fileSize / 1024 / 1024).toFixed(1)}MB`
})

const zone = computed(() => props.exifData?.zone || props.exifData?.tz || null)

const dateTime = computed(() => {
  if (!props.exifData?.DateTimeOriginal) return null
  const d = new Date(props.exifData.DateTimeOriginal)
  if (Number.isNaN(d.getTime())) return null
  return dayjs(d).format('L LT')
})

const colorSpace = computed(() =>
  props.exifData?.ColorSpace
    ? localizeExif('colorSpace', props.exifData.ColorSpace)
    : null,
)

const rating = computed(() => props.exifData?.Rating || 0)

const iso = computed(() => props.exifData?.ISO ?? null)

const aperture = computed(() =>
  props.exifData?.FNumber ? `f/${props.exifData.FNumber}` : null,
)

const shutterSpeed = computed(() => formatExposureTime(props.exifData?.ExposureTime))

const focalLength35mm = computed(() => {
  const v = props.exifData?.FocalLengthIn35mmFormat
  return v ? Number.parseInt(v) : null
})

const focalLength = computed(() => {
  const v = props.exifData?.FocalLength
  return v ? Number.parseInt(v) : null
})

const exposureBias = computed(() =>
  typeof props.exifData?.ExposureCompensation === 'number'
    ? `${props.exifData.ExposureCompensation} EV`
    : null,
)

const maxAperture = computed(() =>
  props.exifData?.MaxApertureValue ? `f/${props.exifData.MaxApertureValue}` : null,
)

const camera = computed(() =>
  props.exifData?.Make && props.exifData?.Model
    ? formatCameraInfo(props.exifData.Make, props.exifData.Model)
    : null,
)

const lens = computed(() => {
  if (props.exifData?.LensMake && props.exifData?.LensModel) {
    return formatLensInfo(props.exifData.LensMake, props.exifData.LensModel)
  }
  return props.exifData?.LensModel || null
})

const exposureProgram = computed(() =>
  props.exifData?.ExposureProgram
    ? localizeExif('exposureProgram', props.exifData.ExposureProgram)
    : null,
)

const exposureMode = computed(() =>
  props.exifData?.ExposureMode
    ? localizeExif('exposureMode', props.exifData.ExposureMode)
    : null,
)

const meteringMode = computed(() =>
  props.exifData?.MeteringMode
    ? localizeExif('meteringMode', props.exifData.MeteringMode)
    : null,
)

const whiteBalance = computed(() =>
  props.exifData?.WhiteBalance
    ? localizeExif('whiteBalance', props.exifData.WhiteBalance)
    : null,
)

const flash = computed(() =>
  props.exifData?.Flash ? localizeExif('flash', props.exifData.Flash) : null,
)

const lightSource = computed(() => props.exifData?.LightSource || null)

const sceneCaptureType = computed(() =>
  props.exifData?.SceneCaptureType
    ? localizeExif('sceneCaptureType', props.exifData.SceneCaptureType)
    : null,
)

const brightnessValue = computed(() =>
  typeof props.exifData?.BrightnessValue === 'number'
    ? `${props.exifData.BrightnessValue.toFixed(1)} EV`
    : null,
)

const shutterSpeedValue = computed(() => {
  const v = props.exifData?.ShutterSpeedValue
  if (!v) return null
  const speed = typeof v === 'number' ? v : Number.parseFloat(String(v))
  if (Number.isNaN(speed)) return null
  return speed >= 1 ? `${speed}s` : `1/${Math.round(1 / speed)}s`
})

const apertureValue = computed(() =>
  typeof props.exifData?.ApertureValue === 'number'
    ? `${props.exifData.ApertureValue.toFixed(1)} EV`
    : null,
)

const sensingMethod = computed(() =>
  props.exifData?.SensingMethod
    ? localizeExif('sensingMethod', props.exifData.SensingMethod)
    : null,
)

const focalPlaneResolution = computed(() => {
  const x = props.exifData?.FocalPlaneXResolution
  const y = props.exifData?.FocalPlaneYResolution
  if (!x || !y) return null
  return `${Math.round(x)} × ${Math.round(y)}`
})

const whiteBalanceBias = computed(() => props.exifData?.WhiteBalanceBias || null)
const wbShiftAB = computed(() => props.exifData?.WBShiftAB || null)
const wbShiftGM = computed(() => props.exifData?.WBShiftGM || null)
const flashMeteringMode = computed(() => props.exifData?.FlashMeteringMode || null)

// ===== GPS =====
const gpsCoordinates = computed(() => {
  if (props.currentPhoto.latitude != null && props.currentPhoto.longitude != null) {
    return {
      latitude: props.currentPhoto.latitude,
      longitude: props.currentPhoto.longitude,
    }
  }
  if (!props.exifData?.GPSLatitude || !props.exifData.GPSLongitude) return null
  return {
    latitude: parseFloat(`${props.exifData.GPSLatitude}`),
    longitude: parseFloat(`${props.exifData.GPSLongitude}`),
  }
})

const gpsLatitude = computed(() => {
  const coord = gpsCoordinates.value
  if (!coord) return null
  const dir = coord.latitude >= 0 ? 'N' : 'S'
  return `${Math.abs(coord.latitude).toFixed(5)}° ${dir}`
})

const gpsLongitude = computed(() => {
  const coord = gpsCoordinates.value
  if (!coord) return null
  const dir = coord.longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(coord.longitude).toFixed(5)}° ${dir}`
})

const locationText = computed(() => {
  const c = props.currentPhoto
  const parts: string[] = []
  if (c.city) parts.push(c.city)
  if (c.country) parts.push(c.country)
  return parts.length ? parts.join(', ') : null
})

// ===== 影调分析（客户端计算） =====
const toneAnalysis = ref<ToneAnalysis | null>(null)
const toneLoading = ref(false)
let toneImage: HTMLImageElement | null = null

const cleanupTone = () => {
  if (toneImage) {
    toneImage.onload = null
    toneImage.onerror = null
    toneImage.src = ''
    toneImage = null
  }
}

watchEffect(() => {
  toneLoading.value = true
  toneAnalysis.value = null
  cleanupTone()

  const url = props.currentPhoto.thumbnailUrl
  if (!url) return

  const img = new Image()
  toneImage = img
  img.crossOrigin = 'anonymous'

  const parsed = new URL(url, window.location.origin)
  parsed.searchParams.set('_cors', Date.now().toString())
  img.src = parsed.toString()

  img.onload = () => {
    if (img !== toneImage) return
    const maxSize = 256
    const scale = Math.min(1, maxSize / img.naturalWidth, maxSize / img.naturalHeight)
    const w = Math.max(1, Math.floor(img.naturalWidth * scale))
    const h = Math.max(1, Math.floor(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      ctx.drawImage(img, 0, 0, w, h)
      try {
        toneAnalysis.value = analyzeToneFromImageData(ctx.getImageData(0, 0, w, h))
      } catch (e) {
        console.error('Failed to analyze tone', e)
      }
    }
    toneLoading.value = false
    toneImage = null
  }

  img.onerror = () => {
    if (img !== toneImage) return
    toneLoading.value = false
    toneImage = null
  }
})

onUnmounted(cleanupTone)

const toneTypeText = computed(() => {
  const t = toneAnalysis.value
  if (!t) return ''
  return $t(`exif.tone.${t.toneType}`) || t.toneType
})

import { isNil } from 'es-toolkit'

const onTagClick = (tag: string) => {
  router.push({ path: '/', query: { tag } })
}

const onAlbumClick = (albumId: number) => {
  window.open(`/albums/${albumId}`)
}
</script>

<template>
  <motion.div
    :initial="false"
    :animate="motionPanel"
    :transition="SHEET_SPRING"
    class="flex flex-col"
    :style="sheetStyle"
    :class="{
      'pointer-events-none': !props.visible,
      'fixed inset-x-0 bottom-0 z-30 w-full rounded-t-2xl overflow-hidden cursor-grab active:cursor-grabbing': isMobile,
      'absolute inset-y-0 right-0 z-30 w-80 border-l border-black/10 dark:border-white/10': !isMobile,
      'inspector-glass': true,
    }"
  >
    <!-- afilmory 内发光层 -->
    <div class="pointer-events-none absolute inset-0 inspector-glass-glow" />

    <!-- 移动端把手（纯装饰，整卡任意位置可上下滑动） -->
    <div
      v-if="isMobile"
      class="flex shrink-0 justify-center pt-2 pb-1 select-none pointer-events-none"
    >
      <div class="h-1.5 w-10 rounded-full" style="background: rgb(var(--cm-text-faint))" />
    </div>

    <!-- afilmory Header：左标题 + 仅移动端的右上角关闭按钮。
         移动端该区始终作为「把手」：满卡后下拉仍可收矮/关闭卡片 -->
    <div
      class="relative z-10 mb-3 flex shrink-0 items-center justify-between px-3.5"
      :class="isMobile ? 'mt-0.5' : 'mt-3.5'"
      :style="isMobile ? { touchAction: 'none' } : {}"
      @pointerdown="(e) => onSheetDown(e as PointerEvent, true)"
    >
      <h3 :class="isMobile ? 'text-base' : 'text-sm'" class="font-medium" style="color: rgb(var(--cm-text-muted))">
        {{ $t('exif.sections.info') }}
      </h3>
      <button
        v-if="onClose"
        type="button"
        aria-label="close"
        class="sheet-close flex size-8 shrink-0 items-center justify-center rounded-full"
        @click="onClose"
      >
        <Icon name="tabler:x" class="size-4" />
      </button>
    </div>

    <!-- 内容区域：移动端「拉满前」锁定并由整卡手势拉伸；「拉满后」切换为内部滚动
         可继续查看底部信息（含地理位置小地图）。桌面端始终常规滚动 -->
    <div
      class="min-h-0 flex-1 px-4 pb-4 content-fade"
      :class="[
        props.visible ? 'content-fade-in' : '',
        isMobile
          ? sheetAtMax
            ? 'overflow-y-auto sheet-scroll'
            : 'overflow-hidden'
          : 'overflow-y-auto pb-8',
      ]"
      :style="isMobile ? { touchAction: sheetAtMax ? 'pan-y' : 'none' } : {}"
      @pointerdown="(e) => onSheetDown(e as PointerEvent, false)"
    >
      <!-- 基本信息 -->
      <div>
        <h4 class="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">{{ $t('exif.sections.basic') }}</h4>
        <div class="space-y-1 text-sm">
          <PhotoInfoRow :label="$t('exif.filename')" :value="currentPhoto.title" ellipsis />
          <PhotoInfoRow v-if="photoFormat" :label="$t('exif.format')" :value="photoFormat" />
          <PhotoInfoRow
            v-if="currentPhoto.width && currentPhoto.height"
            :label="$t('exif.dimensions')"
            :value="`${currentPhoto.width} × ${currentPhoto.height}`"
          />
          <PhotoInfoRow v-if="fileSizeMB" :label="$t('exif.fileSize')" :value="fileSizeMB" />
          <PhotoInfoRow v-if="megaPixels" :label="$t('exif.pixels')" :value="`${megaPixels} MP`" />
          <PhotoInfoRow v-if="colorSpace" :label="$t('exif.colorSpace.title')" :value="colorSpace" />
          <PhotoInfoRow v-if="rating && rating > 0" :label="$t('exif.sections.rating')" :value="'★'.repeat(rating)" />
          <PhotoInfoRow v-if="dateTime" :label="$t('exif.dateTaken.title')" :value="dateTime" />
          <PhotoInfoRow v-if="zone" :label="$t('exif.tz')" :value="zone" />
          <PhotoInfoRow v-if="exifData?.artist" :label="$t('exif.artist')" :value="exifData?.artist" />
          <PhotoInfoRow v-if="exifData?.copyright" :label="$t('exif.copyright')" :value="exifData?.copyright" />
          <PhotoInfoRow v-if="exifData?.software" :label="$t('exif.software')" :value="exifData?.software" />
        </div>

        <!-- 拍摄参数 chips（afilmory 风格：磨砂玻璃 pill，更大字号、更宽松间距，
             背景/文字随 --cm-* 令牌自动适配浅色/深色，浅色下同样带高斯模糊透明） -->
        <div
          v-if="shutterSpeed || iso || aperture || exposureBias || focalLength35mm"
        >
          <h4 class="mb-3 mt-4 text-sm font-medium text-neutral-600 dark:text-neutral-400">
            {{ $t('exif.sections.shooting.parameters') }}
          </h4>
          <div class="grid grid-cols-2 gap-2.5">
            <div v-if="focalLength35mm" class="shooting-pill">
              <Icon name="tabler:focus" class="shooting-pill-icon" />
              <span>{{ focalLength35mm }}mm</span>
            </div>
            <div v-if="aperture" class="shooting-pill">
              <Icon name="tabler:aperture" class="shooting-pill-icon" />
              <span>{{ aperture }}</span>
            </div>
            <div v-if="shutterSpeed" class="shooting-pill">
              <Icon name="tabler:clock" class="shooting-pill-icon" />
              <span>{{ shutterSpeed }}</span>
            </div>
            <div v-if="iso" class="shooting-pill">
              <Icon name="tabler:sun-electricity" class="shooting-pill-icon" />
              <span>ISO{{ iso }}</span>
            </div>
            <div v-if="exposureBias" class="shooting-pill">
              <Icon name="tabler:exposure" class="shooting-pill-icon" />
              <span>{{ exposureBias }}</span>
            </div>
          </div>
        </div>

        <!-- 标签（每行 2 个，与更下方影像分析保持间距） -->
        <div v-if="currentPhoto.tags && currentPhoto.tags.length > 0" class="mt-2 mb-3">
          <h4 class="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">{{ $t('exif.sections.tags') }}</h4>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="tag in currentPhoto.tags"
              :key="tag"
              type="button"
              class="inline-flex cursor-pointer items-center rounded-full border border-neutral-300 bg-white/70 px-2 py-1 text-xs text-neutral-700 backdrop-blur-sm transition-colors hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/20"
              @click="onTagClick(tag)"
            >
              {{ tag }}
            </button>
          </div>
        </div>
      </div>

      <!-- 影调分析 -->
      <div v-if="toneAnalysis">
        <h4 class="mb-2 mt-5 text-sm font-medium text-neutral-600 dark:text-neutral-400">{{ $t('exif.tone.analysis') }}</h4>
        <PhotoInfoRow :label="$t('exif.tone.toneType')" :value="toneTypeText" />
        <div class="mt-1 mb-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <PhotoInfoRow :label="$t('exif.tone.brightness')" :value="`${toneAnalysis.brightness}%`" />
          <PhotoInfoRow :label="$t('exif.tone.contrast')" :value="`${toneAnalysis.contrast}%`" />
          <PhotoInfoRow :label="$t('exif.tone.shadowRatio')" :value="`${Math.round(toneAnalysis.shadowRatio * 100)}%`" />
          <PhotoInfoRow :label="$t('exif.tone.highlightRatio')" :value="`${Math.round(toneAnalysis.highlightRatio * 100)}%`" />
        </div>

        <!-- 直方图 -->
        <div class="mb-3">
          <div class="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">{{ $t('exif.sections.histogram') }}</div>
          <Histogram v-if="currentPhoto.thumbnailUrl" :thumbnail-url="currentPhoto.thumbnailUrl" />
        </div>
      </div>

      <!-- 设备信息 -->
      <div v-if="camera || lens">
        <h4 class="my-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">{{ $t('exif.sections.deviceInfomation') }}</h4>
        <div class="space-y-1 text-sm">
          <PhotoInfoRow v-if="camera" :label="$t('exif.camera')" :value="camera" />
          <PhotoInfoRow v-if="lens" :label="$t('exif.lens')" :value="lens" ellipsis />
          <PhotoInfoRow
            v-if="exifData?.LensMake && !lens?.includes(exifData.LensMake)"
            :label="$t('exif.lens') + ' Make'"
            :value="exifData?.LensMake"
          />
          <PhotoInfoRow v-if="focalLength" :label="$t('exif.focal.length.actual')" :value="`${focalLength}mm`" />
          <PhotoInfoRow v-if="focalLength35mm" :label="$t('exif.focal.length.equivalent')" :value="`${focalLength35mm}mm`" />
          <PhotoInfoRow v-if="maxAperture" :label="$t('exif.maxAperture')" :value="maxAperture" />
        </div>
      </div>

      <!-- 拍摄模式 -->
      <div
        v-if="exposureMode || exposureProgram || meteringMode || whiteBalance || flash || lightSource || sceneCaptureType"
      >
        <h4 class="my-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">{{ $t('exif.sections.shooting.mode') }}</h4>
        <div class="space-y-1 text-sm">
          <PhotoInfoRow v-if="!isNil(exposureProgram)" :label="$t('exif.exposure.program')" :value="exposureProgram" />
          <PhotoInfoRow v-if="!isNil(exposureMode)" :label="$t('exif.exposure.mode')" :value="exposureMode" />
          <PhotoInfoRow v-if="!isNil(meteringMode)" :label="$t('exif.metering.title')" :value="meteringMode" />
          <PhotoInfoRow v-if="!isNil(whiteBalance)" :label="$t('exif.wb.title')" :value="whiteBalance" />
          <PhotoInfoRow v-if="!isNil(whiteBalanceBias)" :label="$t('exif.wb.bias')" :value="whiteBalanceBias" />
          <PhotoInfoRow v-if="!isNil(wbShiftAB)" :label="$t('exif.wb.shiftAB')" :value="wbShiftAB" />
          <PhotoInfoRow v-if="!isNil(wbShiftGM)" :label="$t('exif.wb.shiftGM')" :value="wbShiftGM" />
          <PhotoInfoRow v-if="!isNil(flash)" :label="$t('exif.flash.title')" :value="flash" />
          <PhotoInfoRow v-if="!isNil(flashMeteringMode)" :label="$t('exif.flash.meteringMode')" :value="flashMeteringMode" />
          <PhotoInfoRow v-if="!isNil(lightSource)" :label="$t('exif.lightSource.title')" :value="lightSource" />
          <PhotoInfoRow v-if="!isNil(sceneCaptureType)" :label="$t('exif.scene.captureType')" :value="sceneCaptureType" />
        </div>
      </div>

      <!-- 位置信息（对应 afilmory gps.location.info） -->
      <div v-if="gpsCoordinates">
        <h4 class="my-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">{{ $t('exif.gps.location') }}</h4>
        <div class="space-y-1 text-sm">
          <PhotoInfoRow v-if="gpsLatitude" :label="$t('exif.gps.latitude')" :value="gpsLatitude" />
          <PhotoInfoRow v-if="gpsLongitude" :label="$t('exif.gps.longitude')" :value="gpsLongitude" />
          <PhotoInfoRow v-if="exifData?.GPSAltitude" :label="$t('exif.gps.altitude')" :value="`${exifData?.GPSAltitude}m`" />
          <PhotoInfoRow v-if="locationText" :label="$t('exif.city')" :value="locationText" ellipsis />
        </div>

        <div class="mt-3">
          <PhotoMiniMap
            :photo="currentPhoto"
            :latitude="gpsCoordinates.latitude"
            :longitude="gpsCoordinates.longitude"
          />
        </div>
      </div>

      <!-- 技术参数（对应 afilmory technical.parameters） -->
      <div v-if="brightnessValue || shutterSpeedValue || apertureValue || sensingMethod || focalPlaneResolution">
        <h4 class="my-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">{{ $t('exif.sections.specification') }}</h4>
        <div class="space-y-1 text-sm">
          <PhotoInfoRow v-if="brightnessValue" :label="$t('exif.brightness.value')" :value="brightnessValue" />
          <PhotoInfoRow v-if="shutterSpeedValue" :label="$t('exif.exposure.time')" :value="shutterSpeedValue" />
          <PhotoInfoRow v-if="apertureValue" :label="$t('exif.aperture')" :value="apertureValue" />
          <PhotoInfoRow v-if="sensingMethod" :label="$t('exif.sensing.method')" :value="sensingMethod" />
          <PhotoInfoRow v-if="focalPlaneResolution" :label="$t('exif.focal.plane.resolution')" :value="focalPlaneResolution" />
        </div>
      </div>

      <!-- 相册 -->
      <div v-if="albums.length > 0" class="mt-4">
        <h4 class="mb-2 text-sm font-medium text-neutral-700 uppercase tracking-wide dark:text-neutral-400">
          {{ $t('exif.sections.albums') }}
        </h4>
        <div class="space-y-2">
          <div
            v-for="album in albums"
            :key="album.id"
            class="cursor-pointer rounded-lg border border-neutral-200 bg-white/60 p-3 transition-colors hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            @click="onAlbumClick(album.id)"
          >
            <p class="line-clamp-1 text-sm font-medium text-neutral-800 dark:text-neutral-100">{{ album.title }}</p>
            <p v-if="album.description" class="line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">{{ album.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </motion.div>
</template>

<style scoped>
/* 照片信息侧栏：完全复刻 afilmory InspectorPanel
   材质渐变 materialMedium→materialThick、accent 光晕阴影、内发光、backdrop-blur-2xl(40px)，
   配色随 .dark 用 --cm-* 全局变量自动翻转（浅色：近白玻璃+深字；暗色：深灰玻璃+白字） */
.inspector-glass {
  color: rgb(var(--cm-text));
  background-image: linear-gradient(
    to bottom right,
    rgba(var(--cm-material-medium)),
    rgba(var(--cm-material-thick))
  );
  box-shadow:
    0 8px 32px color-mix(in srgb, rgb(var(--cm-accent)) 8%, transparent),
    0 4px 16px color-mix(in srgb, rgb(var(--cm-accent)) 6%, transparent),
    0 2px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(40px) saturate(1.3);
  -webkit-backdrop-filter: blur(40px) saturate(1.3);
}
/* afilmory 内发光：accent 5% 斜向高光 */
.inspector-glass-glow {
  background: linear-gradient(
    to bottom right,
    color-mix(in srgb, rgb(var(--cm-accent)) 5%, transparent),
    transparent,
    color-mix(in srgb, rgb(var(--cm-accent)) 5%, transparent)
  );
}

/* 打开面板时文字平滑渐入（每次 visible 变 true 触发一次）——
   ease-out-expo 视觉曲线，起步快、收尾柔和，更贴合 iOS 手感 */
.content-fade-in {
  animation: contentFadeIn 0.34s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes contentFadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 移动端右上角"关闭信息"按钮（仅移动端显示） */
.sheet-close {
  background-color: rgb(var(--cm-chip));
  color: color-mix(in srgb, rgb(var(--cm-text)) 82%, transparent);
  border: 1px solid rgb(var(--cm-border));
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.sheet-close:hover {
  background-color: color-mix(in srgb, rgb(var(--cm-accent)) 12%, transparent);
  color: rgb(var(--cm-text));
}

/* 拍摄参数 pill：afilmory 风格磨砂玻璃。
   背景用 --cm-chip（含 alpha、随 .dark 翻转）、描边 --cm-border，配合 backdrop-blur 高斯模糊透明，
   浅色/深色下都呈现一致的玻璃质感；较原先更大、间距更宽松 */
.shooting-pill {
  display: flex;
  min-height: 2.25rem;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.625rem;
  padding: 0 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgb(var(--cm-text));
  background-color: rgb(var(--cm-chip));
  border: 1px solid rgb(var(--cm-border));
  backdrop-filter: blur(12px) saturate(1.25);
  -webkit-backdrop-filter: blur(12px) saturate(1.25);
}
.shooting-pill-icon {
  font-size: 1rem;
  flex-shrink: 0;
  color: rgb(var(--cm-text-muted));
}

/* 移动端满卡后的内部滚动区：阻止触点到达边缘时把整页一起带跑（overscroll 回流） */
.sheet-scroll {
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0);
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.45);
}

:global(.dark) .overflow-y-auto::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.28);
}

:global(.dark) .overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}
</style>