<script lang="ts" setup>
useHead({
  title: '',
})

const { photos } = usePhotos()

// 苹果首次激活式 "hello"：英文单词由行进光晕逐个"点亮"，作为加载画面
const activationChars = ['h', 'e', 'l', 'l', 'o']
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
          <div
            class="fixed inset-0 flex flex-col items-center justify-center"
          >
            <!-- 苹果首次激活式 "hello"：冷色调基底 + 行进光晕逐个点亮字母 + 底部刻写进度 -->
            <div class="activation-word" aria-label="hello">
              <div class="activation-shine" aria-hidden="true" />
              <span
                v-for="(char, index) in activationChars"
                :key="index"
                class="activation-char"
                :style="{ animationDelay: `${0.15 + index * 0.2}s` }"
              >{{ char }}</span>
            </div>

            <div class="activation-progress" aria-hidden="true">
              <i />
            </div>
          </div>
        </template>
      </ClientOnly>
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* ===== 苹果首次激活式 "hello"：优雅衬线 + 行进光晕逐个"点亮"字母 ===== */
.activation-word {
  position: relative;
  display: flex;
  font-family: Georgia, 'Times New Roman', 'Noto Serif SC', 'Songti SC', serif;
  font-style: italic;
  font-weight: 600;
  font-size: clamp(54px, 12vw, 92px);
  line-height: 1;
  letter-spacing: 0.01em;
  color: var(--glass-muted);
  -webkit-font-smoothing: antialiased;
}

.activation-char {
  display: inline-block;
  opacity: 0;
  filter: blur(9px);
  transform: translateY(0.2em) scale(0.76);
  will-change: transform, filter;
  animation: hello-draw 0.95s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

/* 每一字母：从虚化中"落笔浮现"（画出字体） */
@keyframes hello-draw {
  0% {
    opacity: 0;
    filter: blur(9px);
    transform: translateY(0.22em) scale(0.76);
  }
  45% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scale(1);
  }
}

/* 行进光晕：一条柔光带自左向右扫过单词，把经过的字母逐个点亮（苹果激活"光带点亮"） */
.activation-shine {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    100deg,
    transparent 0%,
    transparent 38%,
    color-mix(in srgb, var(--glass-text) 45%, transparent) 46%,
    var(--glass-text) 50%,
    color-mix(in srgb, var(--glass-text) 45%, transparent) 54%,
    transparent 62%,
    transparent 100%
  );
  background-size: 220% 100%;
  background-repeat: no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: hello-shine 2.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes hello-shine {
  0% {
    background-position: 190% 0;
  }
  55%,
  100% {
    background-position: -18% 0;
  }
}

/* 底部刻写进度：一条极细流光从左到右往复，象征"正在加载/书写" */
.activation-progress {
  margin-top: clamp(20px, 3.2vh, 30px);
  width: clamp(120px, 22vw, 220px);
  height: 2px;
  border-radius: 999px;
  background: var(--glass-border);
  overflow: hidden;
  opacity: 0;
  animation: progress-in 0.6s ease-out 1s forwards;
}

.activation-progress > i {
  display: block;
  height: 100%;
  width: 42%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    transparent,
    var(--glass-text),
    transparent
  );
  animation: hello-progress 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes hello-progress {
  0% {
    transform: translateX(-130%);
  }
  100% {
    transform: translateX(360%);
  }
}

@keyframes progress-in {
  to {
    opacity: 1;
  }
}
</style>