<script lang="ts" setup>
useHead({
  title: '',
})

const { photos } = usePhotos()

const route = useRoute()
// 360° 全景预览入口：仅在首页（/）展示
const showPanoPreview = computed(() => route.path === '/')

// 照片风骨架屏：进入画廊时的加载画面品牌名（跟随站点标题，兜底 Chronoval）
const appTitle = useSettingRef('app:title')
const loaderTitle = computed(() => appTitle.value || 'Chronoval')

// 骨架 tile 网格：6 张用来模拟照片，让"加载画廊"有视觉预告（少量 DOl，避免撑大首帧）
const loaderTiles = [1, 2, 3, 4, 5, 6]
</script>

<template>
  <div class="relative min-h-svh">
    <!-- 自适应页面背景（浅色柔光 / 深色深邃），保留高斯模糊的展示底 -->
    <div
      class="page-backdrop pointer-events-none fixed inset-0 -z-10"
      aria-hidden="true"
    />

    <AppTopHeader />

    <!-- 全宽画廊容器：横向无边距，照片从左右边缘贴边展示（edge-to-edge）;
           pt-12 在顶栏与首行照片之间保留一定距离 -->
    <div class="w-full pt-12 pb-16">
      <ClientOnly>
        <MasonryRoot
          :photos="photos"
          columns="auto"
        />
        <template #fallback>
          <!-- 照片风骨架屏：进入画廊时以一组"待显影的照片"占位，淡入 + 行进光泽 -->
          <div
            class="fixed inset-0 flex flex-col items-center justify-center gallery-loader"
            role="status"
            aria-label="loading gallery"
          >
            <div class="loader-brand" aria-hidden="true">
              <span class="loader-brand-glow" />
              <span class="loader-brand-text">{{ loaderTitle }}</span>
            </div>

            <div class="loader-grid" aria-hidden="true">
              <div
                v-for="n in loaderTiles"
                :key="n"
                class="loader-tile"
                :class="`loader-tile--${n}`"
                :style="{ animationDelay: `${0.08 * n}s` }"
              />
            </div>

            <div class="loader-progress" aria-hidden="true">
              <i />
            </div>
          </div>
        </template>
      </ClientOnly>
      <PanoramaHomePreview v-if="showPanoPreview" />
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* ===== 照片风骨架屏：进入画廊时的一组"待显影照片" =====
   观感对齐站点玻璃语义（--glass-*），浅/暗色自适应；骨架 tile 数量少，
   不存在常驻合成层/重型背板，仅作为水墙挂载前的短暂占位 */
.gallery-loader {
  padding: 24px;
}

/* 品牌行：小字大间距 + 底部行进光晕，克制不抢戏 */
.loader-brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: clamp(22px, 4vh, 38px);
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  overflow: hidden;
}

.loader-brand-text {
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--glass-muted);
}

/* 品牌行光带：自左向右缓慢掠过 */
.loader-brand-glow {
  --glow: color-mix(in srgb, var(--glass-accent) 55%, transparent);
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    100deg,
    transparent 0%,
    transparent 40%,
    var(--glow) 50%,
    transparent 60%,
    transparent 100%
  );
  background-size: 220% 100%;
  background-repeat: no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: loader-brand-shine 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes loader-brand-shine {
  0% {
    background-position: 190% 0;
  }
  55%,
  100% {
    background-position: -18% 0;
  }
}

/* 骨架网格：2 行 × 3 列，模拟密排照片 */
.loader-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(8px, 1.4vw, 12px);
  width: min(340px, 86vw);
}

/* 每张"照片"：四角圆角 + 玻璃描边 + 深浅错落的长宽比模拟真实照片分布 */
.loader-tile {
  position: relative;
  border-radius: clamp(8px, 2vw, 14px);
  border: 1px solid var(--glass-border);
  background: var(--glass-chip);
  opacity: 0;
  animation: loader-tile-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  will-change: opacity;
}

.loader-tile::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    105deg,
    transparent 20%,
    color-mix(in srgb, var(--glass-text) 7%, transparent) 40%,
    color-mix(in srgb, var(--glass-text) 10%, transparent) 50%,
    color-mix(in srgb, var(--glass-text) 7%, transparent) 60%,
    transparent 80%
  );
  background-size: 240% 100%;
  background-repeat: no-repeat;
  animation: loader-tile-sheen 1.9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.loader-tile--1,
.loader-tile--4 {
  aspect-ratio: 3 / 4;
}
.loader-tile--2,
.loader-tile--5 {
  aspect-ratio: 1 / 1;
}
.loader-tile--3,
.loader-tile--6 {
  aspect-ratio: 4 / 3;
}

@keyframes loader-tile-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes loader-tile-sheen {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -40% 0;
  }
}

/* 底部刻写进度：一条极细流光往复，象征"正在加载/书写" */
.loader-progress {
  margin-top: clamp(20px, 3.2vh, 30px);
  width: clamp(120px, 22vw, 220px);
  height: 2px;
  border-radius: 999px;
  background: var(--glass-border);
  overflow: hidden;
  opacity: 0;
  animation: loader-progress-in 0.6s ease-out 0.8s forwards;
}

.loader-progress > i {
  display: block;
  height: 100%;
  width: 42%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    transparent,
    var(--glass-accent),
    transparent
  );
  animation: loader-progress-run 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes loader-progress-run {
  0% {
    transform: translateX(-130%);
  }
  100% {
    transform: translateX(360%);
  }
}

@keyframes loader-progress-in {
  to {
    opacity: 1;
  }
}

/* 尊重系统的减少动效偏好 */
@media (prefers-reduced-motion: reduce) {
  .loader-tile,
  .loader-tile::after,
  .loader-brand-glow,
  .loader-progress > i {
    animation: none;
  }
  .loader-tile {
    opacity: 1;
  }
  .loader-progress {
    animation: loader-progress-in 0.1s ease-out both;
  }
}
</style>