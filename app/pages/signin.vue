<script lang="ts" setup>
// 兼容旧路径：/signin → /login（登录入口已迁移到更直观的 /login）
const route = useRoute()
const router = useRouter()

onMounted(() => {
  router.replace({
    path: '/login',
    query: route.query,
  })
})
</script>

<template>
  <div />
</template>