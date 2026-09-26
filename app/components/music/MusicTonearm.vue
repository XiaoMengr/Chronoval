<script setup lang="ts">
/**
 * 唱片机唱臂：模拟黑胶唱片机的读取机构。
 * 播放时唱臂放下、针尖压到唱片上读取；暂停/停止时抬起搁置。
 *
 * - playing：是否播放中
 * - size：与碟片相同的直径
 */
const props = withDefaults(
  defineProps<{
    playing: boolean
    size?: number | string
  }>(),
  {
    size: 240,
  },
)

const px = computed(() =>
  typeof props.size === 'number' ? `${props.size}px` : props.size,
)
</script>

<template>
  <div
    class="tonearm absolute left-0 top-0"
    :style="{ width: px, height: px }"
    :class="{ 'tonearm-down': playing }"
  >
    <!-- 枢轴底座（碟盘右上角外侧） -->
    <div
      class="absolute right-[8%] top-[5%] size-[9%] rounded-full bg-linear-to-br from-[#4a4a55] to-[#141419] shadow-[0_3px_10px_rgba(0,0,0,0.55)]"
    >
      <div
        class="absolute left-1/2 top-1/2 size-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8f8f9c]"
      />
    </div>

    <!-- 唱臂杆：右端为枢轴（origin 100% 0%），向左延伸跨过唱片 -->
    <div class="tonearm-arm absolute right-[8%] top-[5%] w-[70%] origin-[100%_0%]">
      <div
        class="relative h-[5px] w-full rounded-full bg-linear-to-r from-[#e6e6ee] via-[#8a8a96] to-[#3f3f4a] shadow-[0_1px_4px_rgba(0,0,0,0.45)]"
      >
        <!-- 唱头（臂杆左端，播放时压到唱片上） -->
        <div
          class="absolute -left-[2px] top-1/2 h-[17px] w-[11px] -translate-y-1/2 rounded-[3px] bg-linear-to-b from-[#ff6b4a] to-[#d62828] shadow-[0_2px_5px_rgba(0,0,0,0.5)]"
        />
        <!-- 针尖 -->
        <div
          class="absolute -bottom-[3px] left-[2px] size-[5px] rounded-full bg-[#ff6b6b] shadow-[0_0_6px_rgba(255,107,107,0.8)]"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tonearm-arm {
  transition: transform 0.55s cubic-bezier(0.34, 1.4, 0.5, 1);
  will-change: transform;
}

/* 未播放：唱臂抬起搁置 */
.tonearm:not(.tonearm-down) .tonearm-arm {
  transform: rotate(28deg);
}

/* 播放中：唱臂放下，针尖压到唱片 */
.tonearm-down .tonearm-arm {
  transform: rotate(-8deg);
}
</style>
