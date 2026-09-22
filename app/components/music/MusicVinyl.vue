<script lang="ts" setup>
/**
 * 网易云风格黑胶碟盘：旋转的黑色唱片 + 中心标签。
 * - spinning：是否旋转（播放中）
 * - size：直径，可传任意 CSS 尺寸（数字视为 px，亦可传字符串如 '12rem'）
 */
const props = withDefaults(
  defineProps<{
    spinning: boolean
    size?: number | string
    cover?: string | null
  }>(),
  {
    size: 200,
    cover: null,
  },
)

const px = computed(() =>
  typeof props.size === 'number' ? `${props.size}px` : props.size,
)
</script>

<template>
  <div
    class="vinyl relative shrink-0 select-none rounded-full"
    :class="{ 'vinyl-running': spinning }"
    :style="{ width: px, height: px }"
  >
    <!-- 黑胶主体：同心圆纹理 -->
    <div
      class="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,#1f1f26_0%,#26262e_36%,#0d0d11_78%,#050507_100%)] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.65)]"
    >
      <div
        class="absolute inset-0 rounded-full opacity-70"
        style="
          background: repeating-radial-gradient(
            circle at center,
            rgba(255, 255, 255, 0.05) 0 1.5px,
            transparent 1.5px 7px
          );
        "
      />
    </div>

    <!-- 中心标签 -->
    <div
      class="absolute left-1/2 top-1/2 aspect-square w-[38%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-linear-to-br from-[#ff6b4a] to-[#d62c2c] p-[3%] shadow-[inset_0_2px_6px_rgba(0,0,0,0.3),0_4px_14px_rgba(0,0,0,0.5)]"
    >
      <div class="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-black/20">
        <img v-if="cover" :src="cover" alt="" class="h-full w-full object-cover" />
        <Icon v-else name="tabler:music" class="text-white/85" style="font-size: 36%" />
      </div>
    </div>

    <!-- 中心孔 -->
    <div
      class="absolute left-1/2 top-1/2 size-[4%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black shadow-[inset_0_2px_3px_rgba(255,255,255,0.15)]"
    />
  </div>
</template>

<style scoped>
@keyframes vinyl-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 用两层容器 + 变量控制：外层不动，内层旋转（unset 时暂停） */
.vinyl > .absolute {
  animation: vinyl-spin 4.2s linear infinite;
  transform-origin: center;
  will-change: transform;
}

.vinyl:not(.vinyl-running) > .absolute {
  animation-play-state: paused;
}
</style>