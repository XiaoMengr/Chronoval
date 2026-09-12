<script lang="ts" setup>
import { z } from 'zod'
import type { ButtonProps, FormSubmitEvent } from '@nuxt/ui'
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
  submit: [event: FormSubmitEvent<Schema>]
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

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  emit('submit', event)
}

// 暗色玻璃输入框：深色半透明底，白字，聚焦提亮
const inputUi = {
  root: 'w-full',
  base: [
    'w-full rounded-xl border border-white/15 bg-white/8 px-4 py-3.5 text-[1rem] text-white',
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
    <!-- 标题 -->
    <h2
      v-if="title"
      class="text-4xl font-extralight leading-[1.05] tracking-tight text-white text-balance sm:text-5xl"
    >
      {{ title }}
    </h2>
    <p
      v-if="subtitle"
      class="mt-4 max-w-sm text-[0.95rem] font-light leading-relaxed text-white/75"
    >
      {{ subtitle }}
    </p>

    <!-- OAuth providers -->
    <div
      v-if="providers && providers.filter((item) => !!item).length > 0"
      class="mt-8 flex flex-col gap-2.5"
    >
      <UButton
        v-for="provider in providers.filter((item) => !!item)"
        :key="provider.icon"
        v-bind="provider"
        :loading="loading"
        class="!h-12 !rounded-xl !border-white/20 !bg-white/10 !text-white backdrop-blur-md hover:!bg-white/15 !font-medium"
      />
      <div class="flex items-center gap-4 py-2">
        <span class="h-px flex-1 bg-white/15" />
        <span class="text-[0.65rem] uppercase tracking-[0.3em] text-white/50">
          {{ $t('auth.form.action.or') }}
        </span>
        <span class="h-px flex-1 bg-white/15" />
      </div>
    </div>

    <!-- 登录表单 -->
    <UForm
      class="mt-7 space-y-4"
      :schema="schema"
      :state="state"
      :disabled="loading"
      @submit="onSubmit"
    >
      <UFormField
        :label="$t('auth.form.labels.email')"
        name="email"
        :ui="{ label: 'mb-1.5 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/60' }"
      >
        <UInput
          v-model="state.email"
          :autofocus="false"
          placeholder="you@example.com"
          class="w-full"
          :ui="inputUi"
        />
      </UFormField>

      <UFormField
        :label="$t('auth.form.labels.password')"
        name="password"
        :ui="{ label: 'mb-1.5 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/60' }"
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
        type="submit"
        variant="solid"
        color="neutral"
        trailing-icon="tabler:arrow-right"
        block
        size="lg"
        :loading="loading"
        class="mt-1 !h-13 !rounded-xl !bg-white !text-neutral-900 !text-[1rem] !font-medium shadow-lg shadow-black/30 transition-all duration-200 hover:!bg-neutral-100"
      >
        {{ $t('auth.form.action.continue') }}
      </UButton>

      <div class="flex items-center justify-between pt-2">
        <NuxtLink
          to="/"
          class="text-[0.7rem] uppercase tracking-[0.25em] text-white/50 transition-colors hover:text-white"
        >
          {{ $t('auth.form.action.backToHome') }}
        </NuxtLink>
        <span class="text-[0.6rem] text-white/40">f/1.8 · 1/250s</span>
      </div>
    </UForm>
  </div>
</template>