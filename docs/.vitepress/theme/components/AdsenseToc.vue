<script lang="ts" setup>
import { useRoute } from 'vitepress'
import { onBeforeUnmount, onMounted, watch } from 'vue'

const route = useRoute()

const loadAd = () => {
  try {
    // @ts-ignore
    ;(window.adsbygoogle = window.adsbygoogle || []).push({})
  } catch (e) {}
}

let timeoutId: number | null = null

const debouncedLoadAd = () => {
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
  }

  timeoutId = window.setTimeout(() => {
    loadAd()
    timeoutId = null
  }, 300)
}

onMounted(() => {
  loadAd()
})

onBeforeUnmount(() => {
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
})

watch(
  () => route.path,
  () => {
    debouncedLoadAd()
  },
)
</script>

<template>
  <ins
    class="adsbygoogle"
    style="display: inline-block; width: 100%; aspect-ratio: 16/9; z-index: 1"
    data-ad-client="ca-pub-7236608137732943"
    data-ad-slot="5505392595"
  ></ins>
</template>
