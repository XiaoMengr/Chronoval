<script setup lang="ts">
// 全局错误页：优先适配 host-guard「Host 不在白名单」的拦截场景，
// 给出醒目的中文提示与解决步骤；其它错误回退到通用的清爽样式。
// 注意：本页必须自包含——被拦截的请求本身就会作为本页的响应返回，
// 因此不能依赖任何 /api 请求或登录态。

const props = defineProps<{
  error?: any
}>()

const error = computed(() => props.error || {})

// 是否为 Host 白名单拦截错误
const isHostBlocked = computed(() => {
  const e = error.value
  const dataCode = e?.data?.code ?? e?.data?.status ?? ''
  return (
    Number(e.statusCode) === 403 &&
    (dataCode === 'HOST_NOT_ALLOWED' ||
      /host not allowed/i.test(String(e.statusMessage || '')) ||
      /not allowed/i.test(String(e.message || '')))
  )
})

// 被拦截的 Host（优先取自后端 data，其次浏览器地址栏）
const blockedHost = computed(() => {
  if (error.value?.data?.host) return String(error.value.data.host)
  if (import.meta.client) return window.location.host
  return ''
})

const isDark = ref(false)
onMounted(() => {
  isDark.value = document.documentElement.classList.contains('dark')
})

const onBack = () => {
  if (import.meta.client) window.location.assign('/')
}
const onRetry = () => {
  if (import.meta.client) window.location.reload()
}
</script>

<template>
  <section
    class="flex min-h-screen items-center justify-center px-6 py-12"
    style="
      background:
        radial-gradient(52rem 34rem at 15% -10%, rgba(245, 158, 11, 0.09), transparent 55%),
        radial-gradient(46rem 30rem at 90% 0%, rgba(220, 38, 38, 0.06), transparent 55%),
        #f4f3f1;
    "
    :data-dark="isDark ? 'true' : undefined"
  >
    <div
      class="w-full max-w-xl rounded-2xl border border-black/5 bg-white p-8 text-center shadow-[0_20px_60px_rgba(20,20,24,0.10)] sm:p-10"
      style="color-scheme: light dark"
      :style="
        isDark
          ? { background: '#151518', borderColor: 'rgba(255,255,255,0.08)' }
          : {}
      "
    >
      <!-- 醒目的警示图标 -->
      <div
        class="mx-auto flex size-16 items-center justify-center rounded-2xl"
        :style="
          isDark
            ? { background: 'rgba(245,158,11,0.16)' }
            : { background: 'rgba(245,158,11,0.14)' }
        "
      >
        <svg
          v-if="isHostBlocked"
          viewBox="0 0 24 24"
          class="size-8"
          fill="none"
          stroke="#d97706"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M12 3l7 3v5c0 4.5-2.8 8.2-7 10-4.2-1.8-7-5.5-7-10V6l7-3z"
            opacity="0.55"
          />
          <path d="M9.3 9.3l5.4 5.4M14.7 9.3l-5.4 5.4" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          class="size-8"
          fill="none"
          stroke="#dc2626"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5V12" />
          <circle cx="12" cy="15.6" r="0.5" fill="#dc2626" stroke="none" />
        </svg>
      </div>

      <!-- 主标题 -->
      <p
        class="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em]"
        :style="isDark ? { color: '#f5b04c' } : { color: '#b45309' }"
      >
        访问受限 · Host Blocked
      </p>
      <h1
        class="mt-2 text-2xl font-extrabold tracking-tight sm:text-[28px]"
        :style="isDark ? { color: '#f5f5f4' } : { color: '#1c1917' }"
      >
        {{ isHostBlocked ? '无法访问此站点' : '页面出错了' }}
      </h1>

      <!-- 说明正文 -->
      <p
        class="mx-auto mt-3 max-w-md text-sm leading-relaxed sm:text-[15px]"
        :style="isDark ? { color: '#a8a29e' } : { color: '#57534e' }"
      >
        <template v-if="isHostBlocked">
          当前入口的主机（Host）<br />
          <code class="mx-auto mt-2 inline-block rounded-md px-2 py-1 font-mono text-[13px] font-semibold" :style="isDark ? { background: 'rgba(255,255,255,0.08)', color: '#fbbf24' } : { background: '#fef3c7', color: '#92400e' }">
            {{ blockedHost || '未知主机' }}
          </code><br />
          未被加入允许列表，因此本站暂时拒绝响应。
        </template>
        <template v-else>
          请求处理时发生了一些问题。请稍后重试，或联系管理员排查。
        </template>
      </p>

      <!-- 解决步骤（仅 Host 拦截场景） -->
      <div
        v-if="isHostBlocked"
        class="mt-6 rounded-xl p-4 text-left"
        :style="isDark ? { background: 'rgba(255,255,255,0.05)' } : { background: '#fafaf9' }"
      >
        <p class="text-xs font-semibold" :style="isDark ? { color: '#e7e5e4' } : { color: '#44403c' }">
          如何放行当前 Host？
        </p>
        <ol
          class="mt-2 space-y-2 text-[13px] leading-relaxed"
          :style="isDark ? { color: '#a8a29e' } : { color: '#57534e' }"
        >
          <li>
            <b :style="isDark ? { color: '#fbbf24' } : { color: '#92400e' }">方式一（推荐）</b>
            ｜ 管理后台“设置 → 基础设置 → 允许访问的主机”中，把 <code class="font-mono">{{ blockedHost || '当前Host' }}</code> 加入白名单，保存即生效、无需重启。
          </li>
          <li>
            <b :style="isDark ? { color: '#fbbf24' } : { color: '#92400e' }">方式二</b>
            ｜ 部署时通过环境变量 <code class="font-mono">NUXT_ALLOWED_HOSTS</code> 加入该 Host（逗号分隔），例如
            <code class="font-mono">NUXT_ALLOWED_HOSTS="10.0.0.8,dev.1xc.top"</code>，重启容器生效。
          </li>
        </ol>
      </div>

      <!-- 操作按钮 -->
      <div class="mt-7 flex items-center justify-center gap-3">
        <button
          type="button"
          class="cursor-pointer rounded-lg px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          style="background: #d97706; color: #fff; box-shadow: 0 8px 20px rgba(217, 119, 6, 0.30)"
          @click="onRetry"
        >
          重新加载
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors"
          :style="isDark ? { borderColor: 'rgba(255,255,255,0.15)', color: '#e7e5e4' } : { borderColor: '#e7e5e4', color: '#44403c' }"
          @click="onBack"
        >
          返回站点首页
        </button>
      </div>

      <!-- 页脚信息 -->
      <p
        class="mt-6 text-[11px]"
        :style="isDark ? { color: '#57534e' } : { color: '#a8a29e' }"
      >
        {{ isHostBlocked ? 'Host blocked' : (error.statusCode || '') }}
        <template v-if="isHostBlocked && blockedHost"> · {{ blockedHost }}</template>
      </p>
    </div>
  </section>
</template>

<style scoped>
/* 页面级样式：深色模式由内联 style 与 :data-dark 驱动，避免依赖会被拦截的样式表状态 */
</style>