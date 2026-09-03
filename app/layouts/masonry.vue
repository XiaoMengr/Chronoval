<script lang="ts" setup>
useHead({
  title: '',
})

const { photos } = usePhotos()
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
            class="fixed inset-0 flex flex-col items-center justify-center gap-4"
          >
            <Icon
              name="tabler:photo"
              class="size-10 text-(--glass-faint)"
            />
            <span class="loading-scan-wrapper">
              <span class="text-base font-medium loading-scan-text">
                {{ $t('ui.loading') }}
              </span>
            </span>
          </div>
        </template>
      </ClientOnly>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.loading-scan-wrapper {
  display: inline-block;
  position: relative;
}

.loading-scan-text {
  display: inline-block;
  background: linear-gradient(
    90deg,
    var(--ui-text-highlighted) 0%,
    var(--ui-text-highlighted) 30%,
    var(--ui-text-muted) 50%,
    var(--ui-text-highlighted) 70%,
    var(--ui-text-highlighted) 100%
  );
  background-size: 200% 100%;
  background-position: 200% 0;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: transparent;
  animation: scan-x-text 1.2s linear infinite;
}

@keyframes scan-x-text {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>