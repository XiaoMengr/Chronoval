<script setup lang="ts">
/**
 * 拟物化加载卡片的内置插画。
 *
 * 用 SVG 手绘山河 / 草原 / 大海三种风景，模拟真实印刷照片的画面质感
 * （渐变天空、山脉投影、雾气、水面反光、颗粒感），替代纯液态玻璃卡片。
 */
const props = defineProps<{
  scene?: string
}>()

const is = computed(() => props.scene || 'skeuo-mountain')
</script>

<template>
  <svg
    viewBox="0 0 300 400"
    preserveAspectRatio="xMidYMid slice"
    class="h-full w-full"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="skeuo-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#8ec9ee" />
        <stop offset="55%" stop-color="#dfeaf5" />
        <stop offset="100%" stop-color="#f7f0dd" />
      </linearGradient>
      <linearGradient id="skeuo-sky-night" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3f5f8f" />
        <stop offset="55%" stop-color="#8a98b8" />
        <stop offset="100%" stop-color="#c8b9a0" />
      </linearGradient>
      <linearGradient id="skeuo-meadow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#bfe3b2" />
        <stop offset="100%" stop-color="#7fb46a" />
      </linearGradient>
      <linearGradient id="skeuo-sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3f8fc4" />
        <stop offset="100%" stop-color="#1d5d92" />
      </linearGradient>
      <linearGradient id="skeuo-sun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffe6a6" />
        <stop offset="100%" stop-color="#ffc76b" />
      </linearGradient>
      <radialGradient id="skeuo-grain" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.25)" />
        <stop offset="100%" stop-color="rgba(255,255,255,0)" />
      </radialGradient>
    </defs>

    <!-- 山河 -->
    <g v-if="is === 'skeuo-mountain'">
      <rect width="300" height="400" fill="url(#skeuo-sky)" />
      <circle cx="228" cy="64" r="26" fill="url(#skeuo-sun)" opacity="0.95" />
      <path
        d="M0 400 L0 210 L52 138 L96 196 L150 96 L204 202 L250 146 L300 212 L300 400 Z"
        fill="#7f9bb5"
      />
      <path
        d="M150 96 L190 148 L204 160 L150 150 Z"
        fill="#e8f2f8"
        opacity="0.9"
      />
      <path
        d="M96 196 L126 170 L150 170 L204 164 L206 196 Z"
        fill="#d7e2ec"
        opacity="0.9"
      />
      <path
        d="M52 138 L72 158 L96 160 L150 150 L150 182 L52 200 Z"
        fill="#5f7d99"
        opacity="0.6"
      />
      <path
        d="M0 400 L0 262 Q96 234 150 268 T300 254 L300 400 Z"
        fill="#d7e2ec"
        opacity="0.85"
      />
      <path
        d="M0 400 L0 322 Q120 288 300 318 L300 400 Z"
        fill="#5f7d99"
        opacity="0.5"
      />
      <path
        d="M0 400 L0 356 Q160 330 300 360 L300 400 Z"
        fill="#3d5873"
        opacity="0.55"
      />
      <rect width="300" height="400" fill="url(#skeuo-grain)" opacity="0.16" />
    </g>

    <!-- 草原 -->
    <g v-else-if="is === 'skeuo-meadow'">
      <rect width="300" height="400" fill="url(#skeuo-sky)" />
      <circle cx="70" cy="70" r="24" fill="url(#skeuo-sun)" opacity="0.9" />
      <path
        d="M0 400 L0 250 Q84 212 156 250 T300 236 L300 400 Z"
        fill="#a9d495"
      />
      <path
        d="M0 400 L0 300 Q120 266 300 300 L300 400 Z"
        fill="#4f8a4f"
        opacity="0.55"
      />
      <path
        d="M0 400 L0 336 Q150 316 300 340 L300 400 Z"
        fill="#3a6b3a"
        opacity="0.6"
      />
      <!-- 花朵 -->
      <circle cx="60" cy="280" r="4" fill="#f8e7c9" />
      <circle cx="138" cy="302" r="3.4" fill="#f6b9c4" />
      <circle cx="210" cy="288" r="4.2" fill="#fbf0dc" />
      <circle cx="252" cy="316" r="3.6" fill="#f3aab6" />
      <!-- 树木 -->
      <rect x="232" y="224" width="6" height="30" fill="#6b4f3b" />
      <ellipse cx="235" cy="212" rx="22" ry="26" fill="#5f9550" />
      <ellipse cx="225" cy="206" rx="14" ry="17" fill="#78a862" opacity="0.8" />
      <rect width="300" height="400" fill="url(#skeuo-grain)" opacity="0.12" />
    </g>

    <!-- 大海 -->
    <g v-else>
      <rect width="300" height="400" fill="url(#skeuo-sky-night)" />
      <circle cx="150" cy="62" r="30" fill="url(#skeuo-sun)" opacity="0.92" />
      <path
        d="M0 400 L0 214 Q150 180 300 214 L300 400 Z"
        fill="#2a6aa0"
        opacity="0.9"
      />
      <!-- 水波 -->
      <g stroke="#cfe6f5" stroke-width="2" fill="none" opacity="0.6">
        <path d="M0 250 Q30 242 60 250 T120 250 T180 250 T240 250 T300 250" />
        <path d="M0 286 Q36 278 72 286 T144 286 T216 286 T300 286" />
        <path d="M0 322 Q42 314 84 322 T168 322 T300 322" />
      </g>
      <!-- 浪花高光 -->
      <path
        d="M0 400 L0 360 Q120 336 300 366 L300 400 Z"
        fill="#cfe6f5"
        opacity="0.35"
      />
      <!-- 水光 -->
      <ellipse cx="150" cy="252" rx="120" ry="14" fill="#ffffff" opacity="0.18" />
      <rect width="300" height="400" fill="url(#skeuo-grain)" opacity="0.14" />
    </g>
  </svg>
</template>

<style scoped></style>