<script setup lang="ts">
import { motion } from 'motion-v'

defineProps<{
  photo: Photo
}>()
</script>

<template>
  <motion.div
    class="flex items-center gap-0.5 rounded-full bg-black/30 py-1 pl-1.5 pr-1.5 text-[13px] font-bold leading-0 text-white saturate-150 backdrop-blur-md transition-colors duration-300 select-none"
  >
    <Icon name="tabler:rotate-360" class="size-[17px]" />
    <span>360°</span>
  </motion.div>
</template>

<style scoped></style>