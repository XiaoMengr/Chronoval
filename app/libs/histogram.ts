export interface HistogramData {
  red: number[]
  green: number[]
  blue: number[]
  gray: number[]
}

export interface HistogramDataCompressed {
  red: number[]
  green: number[]
  blue: number[]
  gray: number[]
}

export type ToneType = 'low-key' | 'high-key' | 'high-contrast' | 'normal'

export interface ToneAnalysis {
  toneType: ToneType
  brightness: number
  contrast: number
  shadowRatio: number
  highlightRatio: number
}

/**
 * 影调分析：基于 ITU-R BT.709 亮度直方图计算亮度 / 对比度 / 阴影占比 / 高光占比，
 * 并根据阈值判定影调类型。算法与 afilmory 的 analyzeTone 一致。
 */
export const analyzeToneFromImageData = (imageData: ImageData): ToneAnalysis => {
  // 256 级亮度直方图
  const luminance = zeroArray(256)

  const { data } = imageData
  const pixelCount = Math.max(1, imageData.width * imageData.height)

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!

    const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
    luminance[lum]!++
  }

  // 归一化为占比
  for (let i = 0; i < luminance.length; i++) {
    luminance[i] = luminance[i]! / pixelCount
  }

  // 亮度（加权平均）
  let totalLuminance = 0
  let totalPixels = 0
  for (const [i, element] of luminance.entries()) {
    totalLuminance += i * element!
    totalPixels += element!
  }
  const brightness = Math.round((totalLuminance / totalPixels) * (100 / 255))

  // 阴影 / 高光占比
  let shadowRatio = 0
  let highlightRatio = 0
  for (let i = 0; i < 86; i++) {
    shadowRatio += luminance[i]!
  }
  for (let i = 170; i < 256; i++) {
    highlightRatio += luminance[i]!
  }

  // 对比度（标准差）
  const mean = totalLuminance / totalPixels
  let variance = 0
  for (const [i, element] of luminance.entries()) {
    variance += element! * (i - mean) ** 2
  }
  const stdDev = Math.sqrt(variance)
  const contrast = Math.min(100, Math.round((stdDev / 127.5) * 100))

  let toneType: ToneType
  if (brightness < 30 && shadowRatio > 0.6) {
    toneType = 'low-key'
  } else if (brightness > 70 && highlightRatio > 0.6) {
    toneType = 'high-key'
  } else if (contrast > 60 && shadowRatio > 0.3 && highlightRatio > 0.3) {
    toneType = 'high-contrast'
  } else {
    toneType = 'normal'
  }

  return {
    toneType,
    brightness,
    contrast,
    shadowRatio: Math.round(shadowRatio * 100) / 100,
    highlightRatio: Math.round(highlightRatio * 100) / 100,
  }
}

const compressHistogramBin = (data: number[]): number[] => {
  const compressed: number[] = zeroArray(128)
  for (let i = 0; i < data.length; i++) {
    compressed[Math.floor(i / 2)]! += data[i] ?? 0
  }
  return compressed
}

export const calculateHistogramCompressed = (
  imageData: ImageData,
): HistogramDataCompressed => {
  const histogram: HistogramData = {
    red: zeroArray(256),
    green: zeroArray(256),
    blue: zeroArray(256),
    gray: zeroArray(256),
  }

  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    // const a = data[i + 3]
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)

    histogram.red[r]!++
    histogram.green[g]!++
    histogram.blue[b]!++
    histogram.gray[gray]!++
  }

  return {
    red: compressHistogramBin(histogram.red),
    green: compressHistogramBin(histogram.green),
    blue: compressHistogramBin(histogram.blue),
    gray: compressHistogramBin(histogram.gray),
  }
}

// ease-out cubic
const easeOutCubic = (t: number): number => {
  return 1 - Math.pow(1 - t, 3)
}

// 存储每个canvas的动画状态
const canvasAnimationStates = new WeakMap<
  HTMLCanvasElement,
  {
    animationId: number | null
    isAnimating: boolean
  }
>()

export const drawHistogramToCanvas = (
  canvas: HTMLCanvasElement,
  histogram: HistogramDataCompressed,
  options: {
    padding: number
    colors: {
      background: string
      border: string
      grid: string
      red: string
      green: string
      blue: string
      gray: string
    }
  } = {
    padding: 0,
    colors: {
      background: 'rgba(36, 36, 38, .65)',
      border: 'rgba(255, 255, 255, .1)',
      grid: 'rgba(255, 255, 255, .3)',
      red: 'rgba(255, 98, 89, 1)',
      green: 'rgba(46, 209, 87, 1)',
      blue: 'rgba(59, 154, 255, 1)',
      gray: 'rgba(255, 255, 255, 1)',
    },
  },
) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.error('Failed to get canvas context')
    return
  }

  // 获取或创建动画状态
  let animationState = canvasAnimationStates.get(canvas)
  if (!animationState) {
    animationState = { animationId: null, isAnimating: false }
    canvasAnimationStates.set(canvas, animationState)
  }

  // 如果正在动画中，先停止
  if (animationState.isAnimating && animationState.animationId) {
    clearTimeout(animationState.animationId)
  }

  const canvasRect = canvas.getBoundingClientRect()
  const { width, height } = canvasRect
  const dpr = window.devicePixelRatio || 1
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.scale(dpr, dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const maxCount = Math.max(
    ...histogram.red,
    ...histogram.green,
    ...histogram.blue,
    ...histogram.gray,
  )

  if (maxCount === 0) return

  const logicalWidth = width
  const logicalHeight = height
  const chartWidth = logicalWidth - options.padding * 2
  const chartHeight = logicalHeight - options.padding * 2

  const drawBars = (
    data: number[],
    color: string,
    opacity: number = 1,
    progress: number = 1,
  ) => {
    const barWidth = chartWidth / data.length
    for (let i = 0; i < data.length; i++) {
      const fullBarHeight = ((data[i] ?? 0) / maxCount) * chartHeight
      const barHeight = fullBarHeight * progress // Apply animation progress

      // Gradient from bar's top to bottom
      const gradient = ctx.createLinearGradient(
        0,
        options.padding + chartHeight - barHeight,
        0,
        options.padding + chartHeight,
      )

      gradient.addColorStop(0, color.replace(/[\d.]+\)$/, `${opacity})`))
      gradient.addColorStop(1, color.replace(/[\d.]+\)$/, `${opacity * 0.3})`))

      ctx.fillStyle = gradient
      ctx.globalAlpha = opacity

      const x = options.padding + i * barWidth
      const y = options.padding + chartHeight - barHeight
      const w = barWidth * 0.8
      const h = barHeight
      const radius = Math.min(w / 2, 2)

      ctx.beginPath()
      ctx.roundRect(x, y, w, h, [radius, radius, 0, 0])
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  const renderFrame = (progress: number) => {
    ctx.clearRect(0, 0, logicalWidth, logicalHeight)

    // 绘制背景
    ctx.fillStyle = options.colors.background
    ctx.fillRect(0, 0, logicalWidth, logicalHeight)

    // 绘制网格
    ctx.lineWidth = 0.2
    ctx.strokeStyle = options.colors.grid
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath()
      ctx.moveTo(options.padding, options.padding + (chartHeight / 4) * i)
      ctx.lineTo(
        logicalWidth - options.padding,
        options.padding + (chartHeight / 4) * i,
      )
      ctx.stroke()
    }

    // 绘制bars
    drawBars(histogram.gray, options.colors.gray, 0.4, progress)
    ctx.globalCompositeOperation = 'screen'
    drawBars(histogram.red, options.colors.red, 0.8, progress)
    drawBars(histogram.green, options.colors.green, 0.8, progress)
    drawBars(histogram.blue, options.colors.blue, 0.8, progress)
    ctx.globalCompositeOperation = 'source-over'

    // 绘制边框
    ctx.strokeStyle = options.colors.border
    ctx.lineWidth = 1
    ctx.strokeRect(
      options.padding - 0.5,
      options.padding - 0.5,
      chartWidth + 1,
      chartHeight + 1,
    )
  }

  // 开始动画
  animationState.isAnimating = true
  const startTime = Date.now()
  const duration = 600

  const animate = () => {
    const elapsed = Date.now() - startTime
    const rawProgress = Math.min(elapsed / duration, 1)

    const easedProgress = easeOutCubic(rawProgress)

    renderFrame(easedProgress)

    if (rawProgress < 1) {
      animationState.animationId = window.setTimeout(animate, 16) // ~60fps
    } else {
      animationState.isAnimating = false
      animationState.animationId = null
    }
  }

  renderFrame(0)
  animate()
}
