<script lang="ts" setup>
definePageMeta({
  middleware: 'guest',
})

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

// 注：移动端采用弹性布局 + 基于视口高度的响应式间距（clamp）自适应任意尺寸，
// 不使用容器/整页 transform 缩放——实测 transform 与 zoom 都会让 backdrop-filter 毛玻璃失效。
const { fetch: fetchUserSession } = useUserSession()

const config = useRuntimeConfig()
const settingsStore = useSettingsStore()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const isLoading = ref(false)

// AuthForm 实例引用：登录接口失败时复用它的顶部浮动通知卡片（不在卡片内插错误条）
const authFormRef = ref<{ showNotice: (text: string) => void } | null>(null)

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
      // 登入成功反馈：全局 Toast（UApp 内置 Toaster）在 SPA 跳转后依旧可见，
      // 让用户点一下就明确看到"登录成功"，避免"点了没动静"的观感。
      toast.add({
        color: 'success',
        icon: 'tabler:circle-check',
        title: $t('auth.messages.loginSuccess.title'),
        description: $t('auth.messages.loginSuccess.description'),
      })
      // 登入成功后默认直达后台管理面板（而非回到画廊）。
      // 指定了 redirect 参数时优先跳转到目标页，否则进 /dashboard。
      router.push(route.query.redirect?.toString() || '/dashboard')
    })
    .catch((error) => {
      console.error('Login error:', error)
      const status = error?.statusCode || error?.status
      const isInvalid = status === 401
      const message = isInvalid
        ? $t('auth.messages.loginInvalid')
        : (error?.data?.message || $t('auth.messages.loginFailed.description'))
      // 顶部浮动通知卡片：作为失败反馈的唯一入口（不再使用页面内错误条）
      authFormRef.value?.showNotice(message)
      toast.add({
        color: 'error',
        title: $t('auth.messages.loginFailed.title'),
        description: message,
      })
    })
    .finally(() => {
      isLoading.value = false
    })
}
</script>

<template>
  <main class="font-apple login-enter relative flex h-svh w-full flex-col overflow-hidden lg:h-svh lg:flex-row">

    <!-- ===== 统一全屏森林背景层：桌面 + 移动共用，铺满整页 ===== -->
    <div class="absolute inset-0" aria-hidden="true">
      <img
        src="/login-forest/forest-1080p.jpg"
        :srcset="`
          /login-forest/forest-1080p.jpg 1920w,
          /login-forest/forest-2k.jpg 2560w,
          /login-forest/forest.jpg 3840w
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

    <!-- ===== 移动端品牌顶栏（仅移动端）：占位式高斯模糊渐入，仿首页顶栏；占据顶部空间，卡片在其下方不再被遮挡/挤压 ===== -->
    <div class="relative z-30 w-full shrink-0 lg:hidden">
      <!-- 毛玻璃层 + 向下渐隐遮罩：顶部实、向下淡出，与首页顶栏观感一致（暗色高斯模糊） -->
      <div class="absolute inset-0 -z-10 bg-neutral-950/30 backdrop-blur-2xl [mask-image:linear-gradient(to_bottom,black_0%,black_55%,transparent_100%)]" />
      <!-- 品牌内容（logo + CHRONOVAL wordmark，Carter One 水彩笔刷描画动画） -->
      <div class="relative flex items-center gap-3 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] lg:pb-6 lg:pt-6">
        <img :src="appLogo" alt="Chronoval" class="size-8 shrink-0 rounded-lg" />
        <!-- Carter One 圆润手写标题体 + 从左到右渐入水彩绘画 -->
        <span class="brand-wordmark brand-ink text-[0.92rem] leading-none">
          CHRONOVAL
        </span>
      </div>
    </div>

    <!-- ===== 桌面端：左栏放大字标题（仅桌面，占左半） ===== -->
    <aside class="relative z-10 hidden w-full flex-col justify-between p-12 lg:flex lg:w-1/2 xl:p-16">
      <div class="flex items-center gap-3">
        <img :src="appLogo" alt="Chronoval" class="h-8 w-8" />
        <span class="brand-wordmark brand-ink text-[1.05rem] leading-none">
          CHRONOVAL
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
    <section class="relative z-20 flex w-full flex-1 items-center justify-center px-5 py-6 min-h-0 lg:w-1/2 lg:min-h-auto lg:py-0 lg:px-0 lg:pr-14 xl:pr-20">
      <div class="auth-glass w-full max-w-[24rem] rounded-[1.375rem] px-7 py-9 max-h-[88svh] overflow-y-auto sm:px-10 lg:max-w-md lg:rounded-[2rem] lg:px-10 lg:py-12 lg:max-h-none lg:overflow-visible">
        <AuthForm
          ref="authFormRef"
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
/* 整页进入渐入：森林背景 + 卡片 + 顶栏整体淡入，约 0.6s */
.login-enter {
  animation: loginPageIn 0.7s cubic-bezier(0.33, 0, 0.4, 1) both;
}
@keyframes loginPageIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 品牌 wordmark：Carter One + 从左到右渐入水彩绘画。
   墨色从左往右一笔柔和铺开（软边斜角笔锋），同时整体轻微渐显，
   观感干净平顺，像水彩在纸上从左边缓缓洇到右边。 */
.brand-wordmark {
  font-family: 'Carter One', 'Manrope', 'Bradley Hand', system-ui, sans-serif;
  font-weight: 400;
  display: inline-block;
  position: relative;
  letter-spacing: 0.045em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.97);
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 0 18px rgba(255, 255, 255, 0.2);
}
.brand-ink {
  -webkit-mask-image: linear-gradient(
    100deg,
    #000 0%, #000 60%, rgba(0, 0, 0, 0.6) 78%, rgba(0, 0, 0, 0.12) 92%, transparent 100%
  );
  -webkit-mask-size: 410% 100%;
  -webkit-mask-position: 0% 0%;
  -webkit-mask-repeat: no-repeat;
  mask-image: linear-gradient(
    100deg,
    #000 0%, #000 60%, rgba(0, 0, 0, 0.6) 78%, rgba(0, 0, 0, 0.12) 92%, transparent 100%
  );
  mask-size: 410% 100%;
  mask-position: 0% 0%;
  mask-repeat: no-repeat;
  opacity: 0;
  animation: brandReveal 2.7s cubic-bezier(0.33, 0, 0.4, 1) 0.55s both;
}
/* 蒙版宽度从左到右平滑增长（软边笔锋），并整体轻微渐显，形成平顺的“渐入绘画” */
@keyframes brandReveal {
  0%   { mask-size: 5% 100%; -webkit-mask-size: 5% 100%; opacity: 0; }
  62%  { mask-size: 300% 100%; -webkit-mask-size: 300% 100%; opacity: 0.96; }
  100% { mask-size: 410% 100%; -webkit-mask-size: 410% 100%; opacity: 1; }
}

/* 苹果风亮色毛玻璃卡片：白色半透明 + 重高斯模糊，深字高对比；浅/暗主题下均亮眼 */
.auth-glass {
  position: relative;
  background:
    linear-gradient(
      160deg,
      rgba(255, 255, 255, 0.82) 0%,
      rgba(255, 255, 255, 0.55) 100%
    );
  -webkit-backdrop-filter: blur(36px) saturate(1.8);
  backdrop-filter: blur(36px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 30px 70px -20px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

/* 登录失败错误条：淡入淡出 */
.hint-enter-active,
.hint-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.hint-enter-from,
.hint-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>