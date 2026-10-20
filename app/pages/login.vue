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

// 森林背景的响应式 srcset（桌面磨砂上的内嵌亮窗与移动端全屏背景共用同一资源）
const FOREST_SRCSET = `
  /login-forest/forest-1080p.jpg 1920w,
  /login-forest/forest-2k.jpg 2560w,
  /login-forest/forest.jpg 3840w
`

// 注：移动端采用弹性布局 + 基于视口高度的响应式间距（clamp）自适应任意尺寸，
// 不使用容器/整页 transform 缩放——实测 transform 与 zoom 都会让 backdrop-filter 毛玻璃失效。
const { fetch: fetchUserSession } = useUserSession()

const config = useRuntimeConfig()
const settingsStore = useSettingsStore()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const isLoading = ref(false)

// 登录步骤：login=邮箱密码；verify=两步验证码（TOTP）
// 支持 ?step=verify 直达验证码步骤（水合前兜底脚本完成密码校验后以整页跳转交接）
const step = ref<'login' | 'verify'>(route.query.step === 'verify' ? 'verify' : 'login')

// AuthForm 实例引用：桌面与移动各渲染一份（CSS 互斥显示，双端同时在 DOM）。
// 登录接口失败时向两端同时推送顶部浮动通知，只有可见端会实际呈现。
const authFormRef = ref<{ showNotice: (text: string) => void } | null>(null)
const authFormRefDesk = ref<{ showNotice: (text: string) => void } | null>(null)
const showAuthNotice = (message: string) => {
  authFormRef.value?.showNotice(message)
  authFormRefDesk.value?.showNotice(message)
}

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
    .then(async (res: any) => {
      // 账号启用了两步验证：先切换成本地第二步（TOTP 验证码）表单
      if (res?.requires2fa) {
        step.value = 'verify'
        return
      }
      await afterAuthenticated()
    })
    .catch((error) => {
      handleAuthError(error)
    })
    .finally(() => {
      isLoading.value = false
    })
}

const onVerifySubmit = async (event: any) => {
  isLoading.value = true
  await $fetch('/api/login/2fa', {
    method: 'POST',
    body: { code: event.data.code },
  })
    .then(async () => {
      await afterAuthenticated()
    })
    .catch((error) => {
      handleAuthError(error)
    })
    .finally(() => {
      isLoading.value = false
    })
}

// 统一的表单提交入口：按当前步骤分发到对应处理函数（用方法名引用而非三元表达式内联，
// 避免 Vue 把 `cond ? fnA : fnB` 编译成“仅求值不调用”导致点击无反应）。
const onFormSubmit = (event: any) => {
  if (step.value === 'verify') {
    return onVerifySubmit(event)
  }
  return onAuthSubmit(event)
}

// 认证成功后的统一收尾：刷新会话 + 成功提示 + 跳转
const afterAuthenticated = async () => {
  await fetchUserSession()
  toast.add({
    color: 'success',
    icon: 'tabler:circle-check',
    title: $t('auth.messages.loginSuccess.title'),
    description: $t('auth.messages.loginSuccess.description'),
  })
  router.push(route.query.redirect?.toString() || '/dashboard')
}

const handleAuthError = (error: any) => {
  console.error('Login error:', error)
  const status = error?.statusCode || error?.status
  const isInvalid = status === 401
  const message = isInvalid
    ? $t('auth.messages.loginInvalid')
    : (error?.data?.message || $t('auth.messages.loginFailed.description'))
  showAuthNotice(message)
  toast.add({
    color: 'error',
    title: $t('auth.messages.loginFailed.title'),
    description: message,
  })
}
</script>

<template>
  <main class="font-apple login-enter relative flex h-svh w-full flex-col overflow-hidden lg:h-svh lg:flex-row">

    <!-- ===== 统一全屏森林背景层：桌面 + 移动共用，铺满整页 ===== -->
    <div class="absolute inset-0" aria-hidden="true">
      <img
        src="/login-forest/forest-1080p.jpg"
        :srcset="FOREST_SRCSET"
        sizes="100vw"
        alt=""
        decoding="async"
        fetchpriority="high"
        draggable="false"
        class="pointer-events-none select-none h-full w-full object-cover"
      />
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
        <!-- Carter One 圆润手写标题体 + 从左到右水彩笔扫过描画 -->
        <span class="brand-wordmark brand-ink text-[0.92rem] leading-none">
          CHRONOVAL
        </span>
      </div>
    </div>

    <!-- ===== 桌面端：全屏白色高斯磨砂 + 左侧内嵌森林亮窗（四周白色光晕包裹） ===== -->
    <div class="login-desktop absolute inset-0 z-10 hidden lg:block" aria-hidden="true">
      <!-- 全屏白色高斯磨砂：用 mask 在亮窗位置"开洞"——洞内不参与磨砂，直接透出
           已加载的清晰背景原图（无二次图片请求，杜绝先白块后图片的闪烁）；
           上/下/右由登录面板的白玻璃直接覆盖满 -->
      <div class="login-frost absolute inset-0" />

      <!-- 亮窗：仅描边 + 白色光晕 + 窗内压暗承托文案（自身透明，洞里透出的是背景原图） -->
      <div class="login-window absolute overflow-hidden rounded-[1.75rem]">
        <!-- 窗内顶部柔和压暗：承托品牌行 -->
        <div class="absolute inset-x-0 top-0 bg-gradient-to-b from-neutral-950/45 via-neutral-950/10 to-transparent px-8 pb-12 pt-7">
          <div class="flex items-center gap-3">
            <img :src="appLogo" alt="Chronoval" class="h-8 w-8 shrink-0 rounded-lg" />
            <span class="brand-wordmark brand-ink text-[1.05rem] leading-none">
              CHRONOVAL
            </span>
          </div>
        </div>
        <!-- 窗内底部柔和压暗：承托海报大字标题 -->
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-neutral-950/60 via-neutral-950/15 to-transparent px-9 pb-10 pt-20">
          <p class="mb-3 text-[0.68rem] font-medium uppercase tracking-[0.5em] text-white/70">
            Private Photo Collection
          </p>
          <h1 class="max-w-lg text-4xl font-extralight leading-[1.08] tracking-tight text-white text-balance xl:text-5xl">
            {{ $t('auth.poster.title') }}
          </h1>
          <div class="mt-6 h-px w-40 bg-white/35" />
        </div>
      </div>
    </div>

    <!-- ===== 桌面端登录面板：白玻璃直接顶满上/下/右边缘，表单居中坐于磨砂之上（占比收窄让图片更大） ===== -->
    <section class="absolute inset-y-0 right-0 z-20 hidden w-[42%] items-center justify-center lg:flex lg:pr-[3vw]">
      <div class="login-panel w-full max-w-[22rem]">
        <AuthForm
          ref="authFormRefDesk"
          :verify="step === 'verify'"
          :title="$t(step === 'verify' ? 'auth.form.signin.twoFactorTitle' : 'auth.form.signin.title')"
          :subtitle="$t(
            step === 'verify'
              ? 'auth.form.signin.twoFactorSubtitle'
              : 'auth.form.signin.subtitle',
            [config.public.app.title],
          )"
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
          @submit="onFormSubmit"
          @cancel="step = 'login'"
        />
      </div>
    </section>

    <!-- ===== 登录卡片（移动端保持原样：居中浮于全屏森林上） ===== -->
    <section class="relative z-20 flex w-full flex-1 items-center justify-center px-5 py-6 min-h-0 lg:hidden">
      <div class="auth-glass w-full max-w-[24rem] rounded-[1.375rem] px-7 py-9 max-h-[88svh] overflow-y-auto sm:px-10">
        <AuthForm
          ref="authFormRef"
          :verify="step === 'verify'"
          :title="$t(step === 'verify' ? 'auth.form.signin.twoFactorTitle' : 'auth.form.signin.title')"
          :subtitle="$t(
            step === 'verify'
              ? 'auth.form.signin.twoFactorSubtitle'
              : 'auth.form.signin.subtitle',
            [config.public.app.title],
          )"
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
          @submit="onFormSubmit"
          @cancel="step = 'login'"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
/* 整页进入渐入：森林背景 + 卡片 + 顶栏整体淡入，约 0.6s。
   transform: translateZ(0) 让整页进入自己的合成层，避免 opacity 动画
   在每一帧对卡片 backdrop-filter 重新采样——否则毛玻璃卡在重绘时会一闪一闪。 */
.login-enter {
  animation: loginPageIn 0.7s cubic-bezier(0.33, 0, 0.4, 1) both;
  transform: translateZ(0);
  will-change: transform, opacity;
  /* 移动端长按体验修复：去掉点按高亮闪块与文本选中时的白条闪烁，禁用 iOS 长按放大镜/存储卡弹层 */
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
/* 输入框仍保留正常的文本选择与长按菜单能力 */
.login-enter :deep(input),
.login-enter :deep(textarea) {
  -webkit-user-select: text;
  user-select: text;
}
@keyframes loginPageIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
/* 桌面端禁用整页 opacity 渐入：整页淡入会逐帧驱动全屏 backdrop-filter
   重新采样（白块逐块出现的像素卡顿来源之一）。桌面改由面板/亮窗各自的
   轻量动画承担入场；移动端保持原整页淡入不变。 */
@media (min-width: 1024px) {
  .login-enter {
    animation: none;
  }
}

/* ===== 桌面端专属：白色磨砂 + 内嵌森林亮窗 ===== */
.login-desktop {
  /* 亮窗几何参数：磨砂开洞与描边光晕共用（边距收窄让图片占比更大） */
  --win-x: 1.5vw;
  --win-y: 2vh;
  --win-w: 54vw;
  --win-h: 96vh;
  --win-r: 28px;
}

/* 全屏白色高斯磨砂层：罩住整片森林，形成明亮的白色毛玻璃底。
   关键：不做任何 opacity/transform 动画——backdrop-filter 一旦被祖先级
   动画逐帧驱动重采样，就会出现"白色块块逐块出现"的像素卡顿；
   首帧直接渲染到位，一次成型。
   开洞：第二层圆角矩形与第一层做 exclude/xor 合成，洞内不参与磨砂，
   直接透出下层已加载的清晰森林原图（无二次图片请求）。 */
.login-frost {
  background: linear-gradient(
    155deg,
    rgba(255, 255, 255, 0.88) 0%,
    rgba(255, 255, 255, 0.74) 48%,
    rgba(243, 246, 249, 0.84) 100%
  );
  -webkit-backdrop-filter: blur(46px) saturate(1.45);
  backdrop-filter: blur(46px) saturate(1.45);
  -webkit-mask-image:
    linear-gradient(#000 0 0),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' rx='28' fill='black'/></svg>");
  -webkit-mask-position: 0 0, var(--win-x) var(--win-y);
  -webkit-mask-size: 100% 100%, var(--win-w) var(--win-h);
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-composite: xor;
  mask-image:
    linear-gradient(#000 0 0),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' rx='28' fill='black'/></svg>");
  mask-position: 0 0, var(--win-x) var(--win-y);
  mask-size: 100% 100%, var(--win-w) var(--win-h);
  mask-repeat: no-repeat;
  mask-composite: exclude;
}

/* 左侧内嵌森林亮窗：自身完全透明（洞里透出的就是背景原图），
   只承担三件事：1px 白描边 + 收敛的白色光晕（细边让图片占比更大）+
   底部深色投影（窗体厚度）。opacity 渐入安全（无 backdrop-filter）。 */
.login-window {
  left: var(--win-x);
  top: var(--win-y);
  width: var(--win-w);
  height: var(--win-h);
  border-radius: var(--win-r);
  pointer-events: none;
  isolation: isolate;
  transform: translateZ(0);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.95),
    0 0 0 4px rgba(255, 255, 255, 0.4),
    0 0 36px 10px rgba(255, 255, 255, 0.5),
    0 30px 70px -22px rgba(15, 23, 42, 0.36);
  animation: windowIn 0.8s cubic-bezier(0.33, 0, 0.4, 1) 0.1s both;
}
@keyframes windowIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 右侧登录面板：白玻璃直接顶满上/下/右边缘，表单轻微上浮渐入 */
.login-panel {
  animation: panelIn 0.8s cubic-bezier(0.33, 0, 0.4, 1) 0.1s both;
}
@keyframes panelIn {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 品牌 wordmark：Carter One + 从左到右水彩笔扫过描画。
   墨色软边笔锋从左往右一笔掠过整个 CHRONOVAL，配合整体轻微渐显，
   像一支蘸了水彩的毛笔在纸上从左边缓缓画到右边。 */
.brand-wordmark {
  font-family: 'Carter One', 'Manrope', 'Bradley Hand', system-ui, sans-serif;
  font-weight: 400;
  display: inline-block;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.97);
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 0 18px rgba(255, 255, 255, 0.2);
}
.brand-ink {
  -webkit-mask-image: linear-gradient(
    100deg,
    #000 0%, #000 58%, rgba(0, 0, 0, 0.6) 74%, rgba(0, 0, 0, 0.12) 90%, transparent 100%
  );
  -webkit-mask-size: 430% 100%;
  -webkit-mask-position: 0% 0%;
  -webkit-mask-repeat: no-repeat;
  mask-image: linear-gradient(
    100deg,
    #000 0%, #000 58%, rgba(0, 0, 0, 0.6) 74%, rgba(0, 0, 0, 0.12) 90%, transparent 100%
  );
  mask-size: 430% 100%;
  mask-position: 0% 0%;
  mask-repeat: no-repeat;
  opacity: 0;
  animation: brandReveal 2.6s cubic-bezier(0.33, 0, 0.4, 1) 0.5s both;
}
/* 蒙版宽度从左到右平滑增长：软边笔锋把墨色从左往右画过去，同时整体轻微渐显 */
@keyframes brandReveal {
  0%   { mask-size: 4% 100%; -webkit-mask-size: 4% 100%; opacity: 0; }
  60%  { mask-size: 300% 100%; -webkit-mask-size: 300% 100%; opacity: 0.96; }
  100% { mask-size: 430% 100%; -webkit-mask-size: 430% 100%; opacity: 1; }
}

/* 苹果风亮色毛玻璃卡片（移动端）：白色半透明 + 重高斯模糊，深字高对比；浅/暗主题下均亮眼。
   transform: translateZ(0) + will-change 让卡片独占一个稳定的合成层，
   固定 backdrop-filter 的采样源；配合父级整页的合成层，彻底避免登入成功时
   （loading 态切换 / 成功 toast 注入 / 路由切换触发重绘）卡片闪白。 */
.auth-glass {
  position: relative;
  transform: translateZ(0);
  will-change: transform;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  isolation: isolate;
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
