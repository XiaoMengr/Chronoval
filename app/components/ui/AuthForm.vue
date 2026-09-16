<script lang="ts" setup>
import { z } from 'zod'
import type { ButtonProps } from '@nuxt/ui'
import { twMerge } from 'tailwind-merge'

defineProps<{
  icon?: string
  title?: string
  subtitle?: string
  providers?: Array<ButtonProps | false | undefined>
  class?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [event: any]
}>()

const schema = z.object({
  email: z.email($t('auth.form.errors.invalidEmail')),
  password: z.string().min(6, $t('auth.form.errors.invalidPassword')),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  email: undefined,
  password: '',
})

// 邮箱/密码的“无效”提示统一交给页面顶部居中的浮动通知展示（showNotice），
// 不再在卡片内字段下方穿插行内提示，避免错误信息挤在卡片里。
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
const showNotice = (text: string) => {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = ''
  }, 3400)
}

// 细分校验提示：区分“没输入”与“格式错误”，让提示更贴近实际情况。
const sEmail = z.email()
const onSubmit = () => {
  const email = (state.email ?? '').trim()
  const password = state.password ?? ''
  const msgs: string[] = []

  if (!email && !password) {
    msgs.push($t('auth.form.errors.emailAndPasswordMissing'))
  } else {
    if (!email) {
      msgs.push($t('auth.form.errors.emailMissing'))
    } else if (!sEmail.safeParse(email).success) {
      msgs.push($t('auth.form.errors.invalidEmail'))
    }
    if (!password) {
      msgs.push($t('auth.form.errors.passwordMissing'))
    } else if (password.length < 6) {
      msgs.push($t('auth.form.errors.invalidPassword'))
    }
  }

  if (msgs.length) {
    showNotice(msgs.join('，'))
    return
  }
  emit('submit', { data: JSON.parse(JSON.stringify({ email, password })) })
}

// 暴露给父组件：登录接口失败时也能复用同一个顶部浮动通知卡片
defineExpose({ showNotice })

// 暗色玻璃输入框：深色半透明底，白字，聚焦提亮
const inputUi = {
  root: 'w-full',
  base: [
    'w-full rounded-xl border border-white/70 bg-white/60 px-3.5 py-2.5 text-[0.95rem] text-neutral-900 caret-[rgba(100,116,139,0.55)] lg:px-4 lg:py-3.5 lg:text-[1rem]',
    'placeholder:text-neutral-300/90',
    'shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]',
    'transition-all duration-200',
    'outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-transparent',
    'focus:border-white/80 focus:bg-white focus:ring-2 focus:ring-white/20',
    'focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.03),0_1px_0_rgba(255,255,255,0.8)]',
  ].join(' '),
}
</script>

<template>
  <div
    class="relative w-full"
    :class="twMerge('flex flex-col', $props.class)"
  >
    <!-- 顶部浮动通知：点击登入校验失败时在“顶栏下方、屏幕上方偏中间”淡入，数秒后淡出。
         用 fixed 定位，且必须 Teleport 到 body —— 否则登录卡片的 backdrop-filter(毛玻璃) 会成为 fixed
         的包含块，把通知困在卡片内部左上角（表现为“错误显示在卡片内”）。
         Teleport 到 body 后方可真正相对视口固定：顶栏下方、卡片上方、水平居中，且不参与文档流、不推挤卡片。 -->
    <Teleport to="body">
      <Transition name="notice">
        <div
          v-if="notice"
          class="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+5.25rem)] z-[70] flex justify-center px-5 lg:top-[calc(env(safe-area-inset-top)+2rem)]"
        >
          <div class="flex w-[min(78vw,19rem)] items-center gap-2 rounded-xl border border-rose-400/50 bg-white/75 py-1.5 pl-2 pr-3 shadow-2xl shadow-black/35 backdrop-blur-2xl backdrop-saturate-150 sm:w-[min(90vw,20rem)] sm:gap-2.5 sm:border-rose-400/40 sm:bg-white/85 sm:py-2.5 sm:pl-2.5 sm:pr-3.5">
            <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-rose-500/12 text-rose-600 ring-1 ring-inset ring-rose-400/40 sm:size-8">
              <UIcon name="tabler:x" class="size-4" />
            </span>
            <p class="min-w-0 text-[0.75rem] font-semibold leading-snug text-rose-700 sm:text-[0.83rem]">{{ notice }}</p>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 标题 -->
    <h2
      v-if="title"
      class="text-[1.5rem] font-extralight leading-tight tracking-tight text-neutral-900 text-balance sm:text-[1.75rem] lg:text-4xl lg:leading-[1.05]"
    >
      {{ title }}
    </h2>
    <p
      v-if="subtitle"
      class="mt-3 lg:mt-4 max-w-sm text-[0.85rem] lg:text-[0.95rem] font-light leading-relaxed text-neutral-700"
    >
      {{ subtitle }}
    </p>

    <!-- OAuth providers -->
    <div
      v-if="providers && providers.filter((item) => !!item).length > 0"
      class="mt-6 lg:mt-8 flex flex-col gap-2.5"
    >
      <UButton
        v-for="provider in providers.filter((item) => !!item)"
        :key="provider.icon"
        v-bind="provider"
        :loading="loading"
        class="!h-12 !rounded-xl !border-neutral-900/15 !bg-white/60 !text-neutral-900 backdrop-blur-md hover:!bg-white/80 !font-medium"
      />
      <div class="flex items-center gap-3 lg:gap-4 py-1.5 lg:py-2">
        <span class="h-px flex-1 bg-neutral-900/15" />
        <span class="text-[0.65rem] uppercase tracking-[0.3em] text-neutral-500">
          {{ $t('auth.form.action.or') }}
        </span>
        <span class="h-px flex-1 bg-neutral-900/15" />
      </div>
    </div>

    <!-- 登录表单 -->
    <form
      class="mt-5 lg:mt-7 space-y-3.5 lg:space-y-4"
      @submit.prevent="onSubmit"
    >
      <UFormField
        :label="$t('auth.form.labels.email')"
        name="email"
        :ui="{ label: 'mb-1.5 text-[0.6rem] lg:text-[0.65rem] font-medium uppercase tracking-[0.2em] text-neutral-600' }"
      >
        <UInput
          v-model="state.email"
          :autofocus="false"
          class="w-full"
          :ui="inputUi"
        />
      </UFormField>

      <UFormField
        :label="$t('auth.form.labels.password')"
        name="password"
        :ui="{ label: 'mb-1.5 text-[0.6rem] lg:text-[0.65rem] font-medium uppercase tracking-[0.2em] text-neutral-600' }"
      >
        <UInput
          v-model="state.password"
          :autofocus="false"
          type="password"
          placeholder="••••••••"
          class="w-full"
          :ui="inputUi"
        />
      </UFormField>

      <UButton
        type="button"
        variant="solid"
        color="neutral"
        block
        size="lg"
        :loading="loading"
        class="group relative mt-1 !h-12 overflow-hidden !rounded-[0.9rem] !bg-gradient-to-b !from-neutral-800 !to-neutral-950 !font-semibold !text-white !text-[0.95rem] !tracking-wide lg:!h-13 lg:!text-[1rem] !shadow-[0_18px_40px_-14px_rgba(20,20,24,0.7),inset_0_1px_0_rgba(255,255,255,0.18)] transition-all duration-300 hover:!-translate-y-[1px] hover:!shadow-[0_24px_50px_-16px_rgba(20,20,24,0.85),inset_0_1px_0_rgba(255,255,255,0.24)] hover:!brightness-110 active:!translate-y-0 active:!scale-[0.99] active:!brightness-100"
        @click="onSubmit"
      >
        {{ $t('auth.form.action.continue') }}
      </UButton>

      <div class="flex items-center justify-between pt-1 lg:pt-2">
        <NuxtLink
          to="/"
          class="text-[0.7rem] uppercase tracking-[0.25em] text-neutral-500 transition-colors hover:text-neutral-900"
        >
          {{ $t('auth.form.action.backToHome') }}
        </NuxtLink>
        <span class="text-[0.6rem] text-neutral-400">f/1.8 · 1/250s</span>
      </div>
    </form>
  </div>
</template>

<style scoped>
/* 顶部浮动通知：淡入淡出 */
.notice-enter-active,
.notice-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}
.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 输入建议：淡入淡出 */
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