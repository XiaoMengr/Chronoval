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

// 仅输入时建议：字段有内容且校验失败才提示；空/未输入/已通过则不显示
const emailHint = computed(() => {
  const v = state.email ?? ''
  if (!v) return ''
  const r = schema.safeParse(state)
  if (r.success) return ''
  return r.error.issues.find((i) => i.path[0] === 'email')?.message ?? ''
})
const passwordHint = computed(() => {
  const v = state.password ?? ''
  if (!v) return ''
  const r = schema.safeParse(state)
  if (r.success) return ''
  return r.error.issues.find((i) => i.path[0] === 'password')?.message ?? ''
})

// ===== 顶部浮动通知：点击登入校验失败时淡入，数秒后淡出 =====
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
const showNotice = (text: string) => {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = ''
  }, 3400)
}

const onSubmit = () => {
  const r = schema.safeParse(state)
  if (!r.success) {
    const messages = [...new Set(r.error.issues.map((i) => i.message))]
    showNotice(messages.join('，'))
    return
  }
  emit('submit', { data: JSON.parse(JSON.stringify(state)) })
}

// 暴露给父组件：登录接口失败时也能复用同一个顶部浮动通知卡片
defineExpose({ showNotice })

// 暗色玻璃输入框：深色半透明底，白字，聚焦提亮
const inputUi = {
  root: 'w-full',
  base: [
    'w-full rounded-xl border border-white/15 bg-white/8 px-3.5 py-2.5 text-[0.95rem] text-white lg:px-4 lg:py-3.5 lg:text-[1rem]',
    'placeholder:text-white/40',
    'shadow-inner shadow-black/20',
    'transition-all duration-200',
    'focus:border-white/40 focus:bg-white/12 focus:ring-4 focus:ring-white/10',
  ].join(' '),
}
</script>

<template>
  <div
    class="relative w-full"
    :class="twMerge('flex flex-col', $props.class)"
  >
    <!-- 顶部浮动通知：点击登入校验失败时淡入，数秒后淡出 -->
    <Transition name="notice">
      <div
        v-if="notice"
        class="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[70] flex justify-center px-5"
      >
        <div class="flex max-w-md items-center gap-2.5 rounded-2xl border border-rose-300/25 bg-neutral-900/85 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <span class="size-2 shrink-0 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.7)]" />
          <p class="text-sm font-medium leading-snug text-rose-50/95">{{ notice }}</p>
        </div>
      </div>
    </Transition>

    <!-- 标题 -->
    <h2
      v-if="title"
      class="text-[1.75rem] font-extralight leading-[1.1] tracking-tight text-white text-balance lg:text-5xl lg:leading-[1.05]"
    >
      {{ title }}
    </h2>
    <p
      v-if="subtitle"
      class="mt-3 lg:mt-4 max-w-sm text-[0.85rem] lg:text-[0.95rem] font-light leading-relaxed text-white/75"
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
        class="!h-12 !rounded-xl !border-white/20 !bg-white/10 !text-white backdrop-blur-md hover:!bg-white/15 !font-medium"
      />
      <div class="flex items-center gap-3 lg:gap-4 py-1.5 lg:py-2">
        <span class="h-px flex-1 bg-white/15" />
        <span class="text-[0.65rem] uppercase tracking-[0.3em] text-white/50">
          {{ $t('auth.form.action.or') }}
        </span>
        <span class="h-px flex-1 bg-white/15" />
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
        :ui="{ label: 'mb-1.5 text-[0.6rem] lg:text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/60' }"
      >
        <UInput
          v-model="state.email"
          :autofocus="false"
          placeholder="you@example.com"
          class="w-full"
          :ui="inputUi"
        />
        <!-- 仅输入时建议 -->
        <Transition name="hint">
          <p v-if="emailHint" class="mt-1.5 flex items-center gap-1 text-[0.7rem] lg:text-[0.75rem] text-amber-200/80">
            <span class="inline-block size-1 rounded-full bg-amber-300/80" />
            {{ emailHint }}
          </p>
        </Transition>
      </UFormField>

      <UFormField
        :label="$t('auth.form.labels.password')"
        name="password"
        :ui="{ label: 'mb-1.5 text-[0.6rem] lg:text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/60' }"
      >
        <UInput
          v-model="state.password"
          :autofocus="false"
          type="password"
          placeholder="••••••••"
          class="w-full"
          :ui="inputUi"
        />
        <!-- 仅输入时建议 -->
        <Transition name="hint">
          <p v-if="passwordHint" class="mt-1.5 flex items-center gap-1 text-[0.7rem] lg:text-[0.75rem] text-amber-200/80">
            <span class="inline-block size-1 rounded-full bg-amber-300/80" />
            {{ passwordHint }}
          </p>
        </Transition>
      </UFormField>

      <UButton
        type="button"
        variant="solid"
        color="neutral"
        trailing-icon="tabler:arrow-right"
        block
        size="lg"
        :loading="loading"
        class="mt-1 !h-12 lg:!h-13 !rounded-xl !bg-white !text-neutral-900 !text-[0.95rem] lg:!text-[1rem] !font-medium shadow-lg shadow-black/30 transition-all duration-200 hover:!bg-neutral-100"
        @click="onSubmit"
      >
        {{ $t('auth.form.action.continue') }}
      </UButton>

      <div class="flex items-center justify-between pt-1 lg:pt-2">
        <NuxtLink
          to="/"
          class="text-[0.7rem] uppercase tracking-[0.25em] text-white/50 transition-colors hover:text-white"
        >
          {{ $t('auth.form.action.backToHome') }}
        </NuxtLink>
        <span class="text-[0.6rem] text-white/40">f/1.8 · 1/250s</span>
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