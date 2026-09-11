<script lang="ts" setup>
useHead({
  title: '',
})

const { photos } = usePhotos()

// 照片风骨架屏：进入画廊时的加载画面品牌名（跟随站点标题，兜底 Chronoval）
const appTitle = useSettingRef('app:title')
const loaderTitle = computed(() => appTitle.value || 'Chronoval')

// 后台可自定义的三张加载卡片图片（app:loader.images，string[]）
// 为空时回退到默认的液态 SVG 卡片（不带照片）
const loaderImagesSetting = useSettingRef('app:loader.images')
const loaderPhotoUrls = computed(() => {
  const raw = loaderImagesSetting.value
  const list = Array.isArray(raw) ? raw : []
  return list
    .map((it: any) =>
      typeof it === 'string' ? it : it?.src ?? it?.url ?? null,
    )
    .filter((x: any): x is string => typeof x === 'string' && x.trim().length > 0)
    .slice(0, 3)
})
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
          <!-- 照片风骨架屏：品牌胶囊 + 两张长方形玻璃相框层层叠叠 -->
          <div
            class="fixed inset-0 flex flex-col items-center justify-center gallery-loader"
            role="status"
            aria-label="loading gallery"
          >
            <!-- 柔和环境光晕 -->
            <div class="loader-halo" aria-hidden="true" />

            <!-- 品牌玻璃胶囊：大间距标题文字流光 -->
            <div class="loader-brand" aria-hidden="true">
              <span class="loader-brand-text">{{ loaderTitle }}</span>
            </div>

            <!-- 三张长方形相框：左右错开，轮流叠到对方上面，像收发照片一样轮回 -->
            <div class="loader-cards" aria-hidden="true">
              <span class="loader-card loader-card--a">
                <img
                  v-if="loaderPhotoUrls[0]"
                  class="loader-photo"
                  :src="loaderPhotoUrls[0]"
                  alt=""
                  aria-hidden="true"
                />
              </span>
              <span class="loader-card loader-card--b">
                <img
                  v-if="loaderPhotoUrls[1]"
                  class="loader-photo"
                  :src="loaderPhotoUrls[1]"
                  alt=""
                  aria-hidden="true"
                />
              </span>
              <span class="loader-card loader-card--c">
                <img
                  v-if="loaderPhotoUrls[2]"
                  class="loader-photo"
                  :src="loaderPhotoUrls[2]"
                  alt=""
                  aria-hidden="true"
                />
              </span>
            </div>

            <!-- 加载指示条：一根细长的玻璃进度条从右到左生长，作为加载进度指示 -->
            <div class="loader-bar" aria-hidden="true">
              <span class="loader-bar-fill" />
            </div>
          </div>
        </template>
      </ClientOnly>
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* ===== 玻璃质感骨架屏：进入画廊时的短暂占位 =====
   中性玻璃语义（--glass-*），浅/暗色自适应；只用少量 DOM，
   该片段在水墙挂载后即被卸载，不含重型合成层 */

.gallery-loader {
  padding: 24px;
  overflow: hidden;
}

/* 柔和环境光晕：中性玻璃光照缓慢呼吸，给画面一点纵深 */
.loader-halo {
  position: fixed;
  width: min(660px, 94vw);
  aspect-ratio: 1;
  border-radius: 50%;
  pointer-events: none;
  background:
    radial-gradient(
      50% 50% at 36% 38%,
      color-mix(in srgb, var(--glass-text) 9%, transparent),
      transparent 70%
    ),
    radial-gradient(
      50% 50% at 64% 62%,
      color-mix(in srgb, var(--glass-text) 6%, transparent),
      transparent 70%
    );
  filter: blur(34px);
  animation: loader-halo-breathe 5s ease-in-out infinite;
}

@keyframes loader-halo-breathe {
  0%,
  100% {
    opacity: 0.5;
    transform: translateY(0) scale(1);
  }
  50% {
    opacity: 0.9;
    transform: translateY(-12px) scale(1.06);
  }
}

/* 品牌玻璃胶囊：脉冲光点 + 大间距标题文字流光 */
.loader-brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 22px;
  margin-bottom: clamp(30px, 5vh, 48px);
  border-radius: 999px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  box-shadow:
    0 14px 44px -14px color-mix(in srgb, var(--glass-text) 26%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--glass-text) 12%, transparent);
  animation: loader-brand-fade 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes loader-brand-fade {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.loader-brand-text {
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0.38em;
  text-transform: uppercase;
  background-image: linear-gradient(
    110deg,
    var(--glass-muted) 28%,
    color-mix(in srgb, var(--glass-text) 92%, transparent) 48%,
    var(--glass-muted) 60%
  );
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: loader-text-shine 2.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes loader-text-shine {
  0% {
    background-position: 180% 0;
  }
  55%,
  100% {
    background-position: -40% 0;
  }
}

/* 加载指示条：一根细长的玻璃进度条，填充从右向左生长并扫过流光 */
.loader-bar {
  position: relative;
  width: clamp(132px, 30vw, 168px);
  height: 3px;
  margin-top: clamp(30px, 6vh, 52px);
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--glass-text) 14%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--glass-text) 12%, transparent);
}

.loader-bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 38%;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--glass-text) 60%, transparent),
    transparent
  );
  background-size: 120% 100%;
  background-repeat: no-repeat;
  filter: drop-shadow(
    0 0 6px color-mix(in srgb, var(--glass-text) 40%, transparent)
  );
  animation: loader-bar-grow 1.6s ease-in-out infinite;
}

@keyframes loader-bar-grow {
  0% {
    transform: translateX(-110%);
    opacity: 0.85;
  }
  45% {
    opacity: 1;
  }
  100% {
    transform: translateX(320%);
    opacity: 0.9;
  }
}

/* 两张长方形玻璃相框：错位叠放，轮流盖到对方上面 */
.loader-cards {
  position: relative;
  width: clamp(168px, 36vw, 220px);
  aspect-ratio: 3 / 4;
}

.loader-card {
  position: absolute;
  inset: 0;
  border-radius: clamp(12px, 2.5vw, 18px);
  /* 液态玻璃底色：顶部受光更透、底部更沉，形成体积感 */
  background: linear-gradient(
    160deg,
    color-mix(in srgb, #fff 38%, transparent) 0%,
    color-mix(in srgb, #fff 12%, transparent) 32%,
    color-mix(in srgb, #101a26 20%, transparent) 68%,
    color-mix(in srgb, #0a1220 34%, transparent) 100%
  );
  backdrop-filter: blur(28px) saturate(180%) brightness(1.06);
  -webkit-backdrop-filter: blur(28px) saturate(180%) brightness(1.06);
  /* 外投影 + 内描边：上/左受光、下/右暗沉，模拟镀膜玻璃翻边 */
  box-shadow:
    0 42px 96px -30px color-mix(in srgb, #000 64%, transparent),
    0 16px 46px -20px color-mix(in srgb, #000 46%, transparent),
    inset 0 2px 1px rgba(255, 255, 255, 0.62),
    inset 2px 0 1px rgba(255, 255, 255, 0.24),
    inset -1px 0 1px rgba(255, 255, 255, 0.1),
    inset 0 -2px 3px rgba(255, 255, 255, 0.12);
  overflow: hidden;
  will-change: transform, z-index;
}

/* 相框内嵌的"照片"（拟物摄影图）：盖住整卡、四角圆角，像真实印刷照片嵌在玻璃里 */
.loader-photo {
  position: absolute;
  inset: 7px;
  display: block;
  width: calc(100% - 14px);
  height: calc(100% - 14px);
  border-radius: 11px;
  object-fit: cover;
  filter: saturate(0.98) contrast(1.04) brightness(0.98);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
  /* 照片贴合玻璃底，随玻璃一起略微折射的暖调 */
}

/* 玻璃静态镀膜壳（覆盖在照片上方，形成"照片在玻璃之下"的错觉）：
   顶部一圈弧形受光 + 中段体积反光 + 底部边缘反光，勾勒出液态玻璃的曲面 */
.loader-card::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  background:
    /* 顶部主高光：弧形受光面，玻璃最亮处 */
    radial-gradient(
      92% 48% at 26% -6%,
      rgba(255, 255, 255, 0.8),
      rgba(255, 255, 255, 0.16) 44%,
      rgba(255, 255, 255, 0) 62%
    ),
    /* 右上角次高光：第二光源 */
    radial-gradient(
      130% 44% at 84% 6%,
      rgba(255, 255, 255, 0.3),
      rgba(255, 255, 255, 0.03) 52%,
      transparent 64%
    ),
    /* 中部体积反光：玻璃透出照片的淡淡冷色 */
    linear-gradient(
      173deg,
      rgba(255, 255, 255, 0.14),
      rgba(255, 255, 255, 0.02) 26%,
      rgba(255, 255, 255, 0.04) 62%,
      rgba(255, 255, 255, 0.16) 100%
    );
  pointer-events: none;
}

/* 移动的液态高光带：一道明亮的光如液体般从玻璃表面滑过 */
.loader-card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: inherit;
  background: linear-gradient(
    115deg,
    transparent 30%,
    rgba(255, 255, 255, 0.1) 42%,
    rgba(255, 255, 255, 0.34) 50%,
    rgba(255, 255, 255, 0.12) 58%,
    transparent 70%
  );
  mix-blend-mode: screen;
  filter: blur(0.5px);
  pointer-events: none;
  animation: loader-card-liquid 3.2s cubic-bezier(0.5, 0, 0.3, 1) infinite;
}

@keyframes loader-card-liquid {
  0% {
    transform: translateX(-130%);
    opacity: 0;
  }
  16% {
    opacity: 1;
  }
  74% {
    opacity: 1;
  }
  100% {
    transform: translateX(130%);
    opacity: 0;
  }
}

/* 三张相框共用一步循环：前层居中 → 向右滑落为中层 → 交叉到左侧后层 → 重新升起
     三张相位各差 1/3 个周期，于是任意时刻都恰有一张在前、一张偏右中层、一张偏左后层，左右错开叠放 */
.loader-card {
  z-index: 1;
  animation: loader-card-cycle 3.6s cubic-bezier(0.45, 0, 0.2, 1) infinite;
}

.loader-card--a {
  animation-delay: 0s;
}

.loader-card--b {
  animation-delay: -1.2s;
}

.loader-card--c {
  animation-delay: -2.4s;
}

@keyframes loader-card-cycle {
  /* 前层居中 → 向右滑落为中层 → 交叉到左侧后层 → 重新升起 */
  0% {
    transform: translate(0, 0) rotate(0deg) scale(1);
    z-index: 3;
  }
  16% {
    transform: translate(3px, 4px) rotate(1deg) scale(1);
    z-index: 3;
  }
  32% {
    transform: translate(26px, 20px) rotate(6deg) scale(0.91);
    z-index: 2;
  }
  50% {
    transform: translate(30px, 26px) rotate(7deg) scale(0.88);
    z-index: 2;
  }
  64% {
    transform: translate(6px, 30px) rotate(-2deg) scale(0.86);
    z-index: 1;
  }
  82% {
    transform: translate(-28px, 22px) rotate(-6deg) scale(0.88);
    z-index: 1;
  }
  94% {
    transform: translate(-3px, 5px) rotate(0deg) scale(0.98);
    z-index: 3;
  }
  100% {
    transform: translate(0, 0) rotate(0deg) scale(1);
    z-index: 3;
  }
}

/* 尊重系统的减少动效偏好 */
@media (prefers-reduced-motion: reduce) {
  .loader-halo,
  .loader-brand,
  .loader-brand-text,
  .loader-card,
  .loader-card::before,
  .loader-card::after,
  .loader-bar-fill {
    animation: none;
  }
  .loader-card--a {
    transform: translate(-16px, -10px) rotate(-4deg);
    z-index: 3;
  }
  .loader-card--b {
    transform: translate(16px, 8px) rotate(4deg);
    z-index: 2;
  }
  .loader-card--c {
    transform: translate(2px, 16px) rotate(0deg);
    z-index: 1;
  }
}
</style>