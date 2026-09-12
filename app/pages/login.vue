<script lang="ts" setup>
useHead({
  title: () => $t('auth.form.signin.title'),
})

// 程序 Logo（内联 SVG data URI）：避免依赖 public 文件相对路径/尾斜杠解析，
// 在任何路由、任何 baseURL 下都稳定加载，杜绝破图。
const appLogo = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="116" fill="#1c1e22"/>
    <circle cx="256" cy="256" r="148" fill="none" stroke="#f4f4f5" stroke-width="26"/>
    <circle cx="256" cy="256" r="104" fill="none" stroke="#f4f4f5" stroke-width="14" opacity="0.85"/>
    <path d="M256 118 A 138 138 0 0 1 372 178" fill="none" stroke="#f4f4f5" stroke-width="26" stroke-linecap="round" opacity="0.55"/>
    <circle cx="256" cy="256" r="26" fill="#f4f4f5"/>
  </svg>
`)

const { fetch: fetchUserSession } = useUserSession()
const config = useRuntimeConfig()
const settingsStore = useSettingsStore()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const isLoading = ref(false)

const githubOauthEnabled = computed(() => {
  const settingsValue = settingsStore.getSetting('system:auth.github.enabled')
  if (typeof settingsValue === 'boolean') {
    return settingsValue
  }

  return Boolean(config.public.oauth.github.enabled)
})

const onAuthSubmit = async (event: any) => {
  isLoading.value = true
  await $fetch('/api/login', {
    method: 'POST',
    body: event.data,
  })
    .then(async () => {
      await fetchUserSession()
      router.push(route.query.redirect?.toString() || '/')
    })
    .catch((error) => {
      console.error('Login error:', error)
      toast.add({
        color: 'error',
        title: $t('auth.messages.loginFailed.title'),
        description: error?.data?.message || $t('auth.messages.loginFailed.description'),
      })
    })
    .finally(() => {
      isLoading.value = false
    })
}
</script>

<template>
  <main class="relative flex min-h-svh w-full flex-col overflow-hidden lg:flex-row">

    <!-- ===== 统一全屏森林背景层：桌面 + 移动共用，铺满整页 ===== -->
    <div class="absolute inset-0" aria-hidden="true">
      <img
        src="/login/forest-1080p.jpg"
        :srcset="`
          /login/forest-1080p.jpg 1920w,
          /login/forest-2k.jpg 2560w,
          /login/forest.jpg 3840w
        `"
        sizes="100vw"
        alt=""
        decoding="async"
        fetchpriority="high"
        class="h-full w-full object-cover"
      />
      <!-- 桌面：左侧重压暗留白字区，右侧轻压暗留卡片区 -->
      <div class="absolute inset-0 hidden lg:block">
        <div class="absolute inset-0 bg-neutral-950/40" />
        <div class="absolute inset-0 bg-gradient-to-r from-neutral-950/60 via-transparent to-transparent lg:bg-gradient-to-r" />
      </div>
      <!-- 移动：整体均匀轻压暗，保证白玻璃卡与品牌可读，不强化上下渐变 -->
      <div class="absolute inset-0 bg-neutral-950/35 lg:hidden" />
    </div>

    <!-- ===== 桌面端：左栏放大字标题（仅桌面，占左半） ===== -->
    <aside class="relative z-10 hidden w-full flex-col justify-between p-12 lg:flex lg:w-1/2 xl:p-16">
      <div class="flex items-center gap-3">
        <img :src="appLogo" alt="Chronoval" class="h-8 w-8" />
        <span class="text-[0.7rem] font-semibold uppercase tracking-[0.4em] text-white/80">
          Chronoval
        </span>
      </div>

      <div>
        <p class="mb-4 text-[0.7rem] font-medium uppercase tracking-[0.5em] text-white/55">
          Private Photo Collection
        </p>
        <h1 class="max-w-md text-6xl font-extralight leading-[1.05] tracking-tight text-white text-balance xl:text-7xl">
          {{ $t('auth.poster.title') }}
        </h1>
        <div class="mt-8 h-px w-full max-w-sm bg-white/25" />
      </div>
    </aside>

    <!-- ===== 登录卡片：桌面偏右占右半，移动居中浮于全屏森林上 ===== -->
    <section class="relative z-20 flex w-full flex-1 items-center justify-center px-6 py-10 lg:w-1/2 lg:py-0 lg:pr-14 xl:pr-20">
      <!-- 移动端顶部品牌（仅移动） -->
      <div class="absolute left-6 top-6 flex items-center gap-3 lg:hidden">
        <img :src="appLogo" alt="Chronoval" class="h-8 w-8" />
        <span class="text-[0.7rem] font-semibold uppercase tracking-[0.4em] text-white/85">
          Chronoval
        </span>
      </div>

      <div class="auth-glass w-full max-w-md rounded-[2rem] px-8 py-10 sm:px-10">
        <AuthForm
          :title="$t('auth.form.signin.title')"
          :subtitle="$t('auth.form.signin.subtitle', [config.public.app.title])"
          :loading="isLoading"
          :providers="[
            githubOauthEnabled && {
              icon: 'tabler:brand-github',
              size: 'lg',
              color: 'neutral',
              variant: 'outline',
              block: true,
              label: 'GitHub',
              to: '/api/auth/github',
              external: true,
            },
          ]"
          @submit="onAuthSubmit"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
/* 暗色森林玻璃卡片：墨绿系半透明玻璃，白字高对比，浅/暗主题下均清晰 */
.auth-glass {
  position: relative;
  background:
    linear-gradient(
      160deg,
      rgba(24, 32, 27, 0.55) 0%,
      rgba(14, 18, 16, 0.72) 100%
    );
  -webkit-backdrop-filter: blur(36px) saturate(1.5);
  backdrop-filter: blur(36px) saturate(1.5);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow:
    0 30px 70px -20px rgba(0, 0, 0, 0.65),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
</style>