<script setup lang="ts">
import * as THREE from 'three'

interface Props {
  /** 等距柱状投影全景图地址 */
  src: string
  /** 交互开关（默认开启） */
  interactive?: boolean
  /** 初始 FOV（默认 115°=最宽的缩小视角，整张全景一进入就清晰完整；此后只能手动放大） */
  initialFov?: number
  /** 是否聚焦按钮提示（由父级展示后再触发 ready，避免首帧闪黑） */
  parentFocused?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  interactive: true,
  initialFov: 115,
  parentFocused: true,
})

const emit = defineEmits<{
  /** 纹理加载完成、首帧已渲染 */
  ready: []
  /** 用户正在拖拽/操作（用于父级隐藏 UI 等） */
  interacting: [interacting: boolean, zoomed: boolean]
}>()

const containerRef = ref<HTMLDivElement>()

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let sphere: THREE.Mesh | null = null
let texture: THREE.Texture | null = null
let rafId = 0
let disposed = false

// 视角状态（度）
let lon = 0
let lat = 0
// 惯性速度
let velLon = 0
let velLat = 0
// 缩放
let fov = props.initialFov

// 指针状态
let dragging = false
let prevX = 0
let prevY = 0
let pointerCount = 0
let pinchDist = 0
let pinchFov = fov
let t0 = 0



function setFov(next: number) {
  if (!camera) return
  // 进入即是最宽的缩小视角（initialFov=115°，整图清晰完整）。
  // 把缩小上限卡在 initialFov：开局即为最宽，只能继续放大（fov 减小），不允许再缩小（fov 增大）。
  fov = THREE.MathUtils.clamp(next, 25, props.initialFov)
  camera.fov = fov
  camera.updateProjectionMatrix()
  emit('interacting', dragging, fov < 100)
}

function frame(time: number) {
  if (disposed) return
  rafId = requestAnimationFrame(frame)

  const dt = Math.min(1, (time - t0) / 1000)
  t0 = time

  // ===== 沉浸式环视模式 =====
  if (dragging) {
    velLon *= 0.92
    velLat *= 0.92
    lon += velLon
    lat += velLat
  } else {
    lon += velLon
    lat += velLat
    velLon *= 0.9
    velLat *= 0.9
    if (Math.abs(velLon) < 0.002 && Math.abs(velLat) < 0.002) {
      velLon = 0
      velLat = 0
    }
  }
  // 水平可无限转，垂直限制在 ±89°
  lat = Math.max(-89, Math.min(89, lat))

  if (camera) {
    const polar = THREE.MathUtils.degToRad(90 - lat)
    const azi = THREE.MathUtils.degToRad(lon)
    const dir = new THREE.Vector3().setFromSphericalCoords(1, polar, azi)
    camera.lookAt(dir)
  }

  renderer?.render(scene!, camera!)
}

function setPointerDown(x: number, y: number) {
  dragging = true
  velLon = 0
  velLat = 0
  prevX = x
  prevY = y
  emit('interacting', true, fov < 100)
}

function setPointerMove(x: number, y: number) {
  if (!dragging) return
  const dx = x - prevX
  const dy = y - prevY
  prevX = x
  prevY = y
  // 拖动灵敏度偏低，跟随手指但明显更稳、不快
  velLon = dx * 0.12
  velLat = dy * 0.12
  lon += velLon
  lat += velLat
}

function setPointerUp() {
  dragging = false
  emit('interacting', false, fov < 100)
}

const onPointerDown = (e: PointerEvent) => {
  if (!props.interactive) return
  if (e.pointerType === 'touch') {
    pointerCount++
    if (pointerCount === 1) {
      containerRef.value?.setPointerCapture(e.pointerId)
      setPointerDown(e.clientX, e.clientY)
    }
  } else {
    containerRef.value?.setPointerCapture(e.pointerId)
    setPointerDown(e.clientX, e.clientY)
  }
}

const onPointerMove = (e: PointerEvent) => {
  if (e.pointerType === 'touch') {
    // 双指缩放
    if (pointerCount >= 2) {
      e.preventDefault()
    }
    setPointerMove(e.clientX, e.clientY)
  } else if (dragging) {
    setPointerMove(e.clientX, e.clientY)
  }
}

const onPointerUp = (e: PointerEvent) => {
  if (e.pointerType === 'touch') {
    pointerCount = Math.max(0, pointerCount - 1)
    if (pointerCount === 0) {
      try { containerRef.value?.releasePointerCapture(e.pointerId) } catch {}
      setPointerUp()
    }
  } else {
    try { containerRef.value?.releasePointerCapture(e.pointerId) } catch {}
    setPointerUp()
  }
}

function computeTouchDist(e: TouchEvent) {
  const ts = Array.from(e.touches)
  if (ts.length < 2) return 0
  return Math.hypot(ts[1].clientX - ts[0].clientX, ts[1].clientY - ts[0].clientY)
}

const onTouchStart = (e: TouchEvent) => {
  if (!props.interactive) return
  if (e.touches.length === 2) {
    pinchDist = computeTouchDist(e)
    pinchFov = fov
    dragging = false
    setPointerUp()
  }
}

const onTouchMove = (e: TouchEvent) => {
  if (!props.interactive) return
  if (e.touches.length === 2) {
    const d = computeTouchDist(e)
    if (pinchDist > 0 && d > 0) {
      const next = (pinchFov * pinchDist) / d
      setFov(next)
    }
  }
}

const onWheel = (e: WheelEvent) => {
  if (!props.interactive) return
  e.preventDefault()
  setFov(fov + (e.deltaY > 0 ? 12 : -12))
}

const onDblClick = (e: MouseEvent) => {
  if (!props.interactive) return
  e.preventDefault()
  lon = 0
  lat = 0
  setFov(props.initialFov)
  emit('interacting', false, false)
}

function init() {
  const el = containerRef.value
  if (!el) return

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(el.clientWidth, el.clientHeight)
  el.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(fov, el.clientWidth / el.clientHeight, 0.1, 1200)

  const geo = new THREE.SphereGeometry(100, 64, 48)
  const mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide })
  sphere = new THREE.Mesh(geo, mat)
  sphere.rotation.y = 0
  scene.add(sphere)

  // 内部贴合 background 的渐变，避免透明/黑闪
  scene.background = new THREE.Color(0x0a0a0e)
  scene.fog = null

  // 加载纹理
  const loader = new THREE.TextureLoader()
  texture = loader.load(
    props.src,
    () => {
      if (disposed) return
      emit('ready')
    },
    undefined,
    () => {
      if (disposed) return
      geoScaleFallback()
      emit('ready')
    },
  )
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  mat.map = texture

  // 尺寸自适应
  const ro = new ResizeObserver(() => {
    const ew = el.clientWidth
    const eh = el.clientHeight
    if (!renderer || !camera || ew === 0 || eh === 0) return
    renderer.setSize(ew, eh)
    camera.aspect = ew / eh
    camera.updateProjectionMatrix()
  })
  ro.observe(el)
  ;(renderer as unknown as { __ro?: ResizeObserver }).__ro = ro

  window.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('dblclick', onDblClick)

  TweenSafeReset()
}

/** 与三.js 无关的降级：图片加载失败时给球面上纯色，仍然可环视 */
function geoScaleFallback() {
  if (!sphere) return
  const m = sphere.material as THREE.MeshBasicMaterial
  if (!m.map?.image) {
    m.color.setHex(0x22222a)
  }
}

// 初始朝向：让 lon=0 正对相机前方
function TweenSafeReset() {
  lon = 0
  lat = 0
  velLon = 0
  velLat = 0
  fov = props.initialFov
  if (camera) {
    camera.fov = props.initialFov
    camera.updateProjectionMatrix()
  }
}

onMounted(() => {
  if (typeof window === 'undefined') return
  requestAnimationFrame(() => init())
  rafId = requestAnimationFrame(frame)
  t0 = performance.now()
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(rafId)
  window.removeEventListener('wheel', onWheel)
  window.removeEventListener('dblclick', onDblClick)
  const ro = (renderer as unknown as { __ro?: ResizeObserver })?.__ro
  ro?.disconnect()
  containerRef.value?.replaceChildren()
  sphere?.geometry.dispose()
  ;(sphere?.material as THREE.Material | undefined)?.dispose()
  texture?.dispose()
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  sphere = null
  texture = null
})
</script>

<template>
  <div
    ref="containerRef"
    class="absolute inset-0 touch-none overflow-hidden"
    :class="{ 'cursor-grab active:cursor-grabbing': interactive }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
  />
</template>