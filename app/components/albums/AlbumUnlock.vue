<script lang="ts" setup>
const props = defineProps<{
  /** 相簿 id（用于调用解锁接口） */
  albumId: number
  /** 相簿标题（可选，展示在解锁卡片上方） */
  title?: string
}>()
const emit = defineEmits<{
  /** 解锁成功后通知父级刷新相簿内容 */
  success: []
}>()

const { t } = useI18n()

const passwordInput = ref('')
const unlockError = ref<string | null>(null)
const unlockSuccess = ref(false)
const unlocking = ref(false)
// 每次解锁失败自增，作为 error-key 触发卡片抖动动画
const shakeKey = ref(0)
// 瞬时“解锁失败”态：驱动锁+钥匙动画，稍后自动还原回待输入界面
const unlockFailed = ref(false)
let failTimer: ReturnType<typeof setTimeout> | null = null

const stopFailTimer = () => {
  if (failTimer) {
    clearTimeout(failTimer)
    failTimer = null
  }
}

const onSubmitPassword = async () => {
  if (unlocking.value) return // 防止并发/重复提交
  unlockError.value = null
  unlockFailed.value = false
  stopFailTimer()
  const pw = passwordInput.value
  if (!pw) {
    unlockError.value = t('albums.scan.passwordRequired')
    shakeKey.value++
    return
  }
  unlocking.value = true
  try {
    await $fetch(`/api/albums/${props.albumId}/unlock`, {
      method: 'POST',
      body: { password: pw },
    })
    stopFailTimer()
    unlockFailed.value = false
    passwordInput.value = ''
    unlockSuccess.value = true
    // 短暂展示“密码正确”的成功反馈，再切换到相簿内容
    await new Promise((r) => setTimeout(r, 700))
    emit('success')
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number })?.statusCode
    unlockFailed.value = true
    unlockError.value =
      statusCode === 401
        ? t('albums.scan.wrongPassword')
        : t('albums.scan.unlockError')
    shakeKey.value++ // 触发卡片抖动
    stopFailTimer()
    failTimer = setTimeout(() => {
      unlockFailed.value = false
      failTimer = null
    }, 1200)
  } finally {
    unlocking.value = false
  }
}
</script>

<template>
  <div
    class="relative flex min-h-[60vh] items-center justify-center overflow-hidden px-5 py-16 sm:px-6"
  >
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_60%_at_50%_42%,#e3e5ec_0%,rgba(227,229,236,0)_74%)] dark:bg-[radial-gradient(55%_60%_at_50%_42%,#26262c_0%,rgba(38,38,44,0)_74%)]"
    />

    <div
      :key="shakeKey"
      :class="unlockError ? 'kernel-lock-shake' : ''"
      class="kernel-lock-card relative mx-auto w-full max-w-[25rem]"
    >
      <div
        class="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/15"
      />

      <div
        v-if="title"
        class="flex items-center justify-center gap-2 pb-1 text-center text-[13px] font-medium text-neutral-500 dark:text-neutral-400"
      >
        <Icon name="tabler:lock" class="size-3.5 shrink-0" />
        <span>{{ title }}</span>
      </div>

      <div class="relative flex flex-col items-center gap-4 px-8 pb-2 pt-6 text-center sm:px-9">
        <div class="relative grid size-16 place-items-center">
          <svg
            viewBox="0 0 48 48"
            fill="none"
            :class="unlockSuccess ? 'kd-open' : unlockFailed ? 'kd-error' : unlocking ? 'kd-try' : ''"
            class="kernel-lock-svg relative size-11"
          >
            <defs>
              <linearGradient id="alm-lock-body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="var(--kd-body-hi)" />
                <stop offset="0.55" stop-color="var(--kd-body-mid)" />
                <stop offset="1" stop-color="var(--kd-body-lo)" />
              </linearGradient>
              <linearGradient id="alm-lock-shackle" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="var(--kd-shackle-hi)" />
                <stop offset="1" stop-color="var(--kd-shackle-lo)" />
              </linearGradient>
              <linearGradient id="alm-lock-shade" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="rgba(0,0,0,0)" />
                <stop offset="1" stop-color="rgba(0,0,0,0.16)" />
              </linearGradient>
            </defs>

            <ellipse cx="24" cy="41.5" rx="16.5" ry="2.4" fill="rgba(0,0,0,0.16)" />

            <g class="kernel-lock-shackle">
              <path
                d="M17.5 21.5 V15.4 a6.6 6.6 0 0 1 13.2 0 V21.5"
                stroke="url(#alm-lock-shackle)"
                stroke-width="4.8"
                stroke-linecap="round"
              />
              <path
                d="M18.6 21.5 V16 a5.4 5.4 0 0 1 10.8 0 V21.5"
                stroke="rgba(255,255,255,0.5)"
                stroke-width="1"
                stroke-linecap="round"
              />
            </g>

            <rect x="10.5" y="19.5" width="27" height="20" rx="5.5" fill="url(#alm-lock-body)" />
            <rect x="13" y="21.3" width="22" height="2" rx="1" fill="rgba(255,255,255,0.6)" />
            <rect x="11.5" y="36" width="25" height="2.6" rx="1.3" fill="url(#alm-lock-shade)" />
            <path
              d="M12.3 24 Q11 25.6 11 28.2 v3 Q11 34 13 36.8 l1-1.3 Q13 34 13 31.2 v-3 Q13 25.6 14 23.6 Z"
              fill="rgba(0,0,0,0.06)"
            />

            <g class="kernel-lock-keyhole">
              <rect x="22.7" y="34.6" width="2.6" height="4.4" rx="1.2" fill="var(--kd-keyhole)" />
              <circle cx="24" cy="30.6" r="3" fill="var(--kd-keyhole)" />
              <circle cx="23.2" cy="29.8" r="0.9" fill="rgba(255,255,255,0.5)" />
            </g>

            <g class="kernel-lock-key">
              <circle cx="24" cy="24" r="3" fill="none" stroke="var(--kd-key-line)" stroke-width="1.7" />
              <path d="M24 27 v8.6" stroke="var(--kd-key-line)" stroke-width="1.9" stroke-linecap="round" />
              <path d="M26 33.2 h1.5 M25.7 36 h2.3" stroke="var(--kd-key-line)" stroke-width="1.4" stroke-linecap="round" />
            </g>

            <g class="kernel-lock-check">
              <circle cx="30" cy="27.5" r="7" fill="rgba(16,185,129,0.12)" stroke="rgba(16,185,129,0)" />
              <path
                d="M26.8 27.6 l2.2 2.3 4.1-4.4"
                stroke="#10b981"
                stroke-width="2.2"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </g>

            <g class="kernel-lock-x">
              <circle cx="30" cy="27.5" r="7" fill="rgba(239,68,68,0.12)" />
              <path
                d="M27.7 25.2 l4.6 4.6 M32.3 25.2 l-4.6 4.6"
                stroke="#ef4444"
                stroke-width="2.2"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </g>
          </svg>
        </div>
        <h2 class="text-[17px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          {{ t('albums.scan.lockedTitle') }}
        </h2>
        <p class="text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {{ t('albums.scan.lockedHint') }}
        </p>
      </div>

      <form
        v-if="!unlockSuccess"
        class="relative flex flex-col items-stretch gap-3.5 px-8 pb-9 pt-5 sm:px-9"
        @submit.prevent="onSubmitPassword"
      >
        <div class="relative">
          <span class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-neutral-400 dark:text-neutral-500">
            <Icon name="tabler:key" class="size-4" />
          </span>
          <input
            v-model="passwordInput"
            type="password"
            :placeholder="t('albums.scan.passwordPlaceholder')"
            autocomplete="current-password"
            :disabled="unlocking"
            class="size-full w-full rounded-2xl bg-black/[0.035] px-6 py-3 text-center text-sm text-neutral-900 outline-none transition-colors placeholder:text-center placeholder:text-neutral-400 selection:bg-black/10 hover:bg-black/[0.05] focus:bg-black/[0.05] dark:bg-white/[0.05] dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:hover:bg-white/[0.07] dark:focus:bg-white/[0.07]"
          />
        </div>

        <Transition name="kernel-msg" mode="out-in">
          <p
            v-if="unlockError"
            :key="'err'"
            class="flex items-center justify-center gap-1.5 text-center text-[13px] font-medium text-red-500"
          >
            <Icon name="tabler:alert-circle" class="size-4 shrink-0" />
            {{ unlockError }}
          </p>
        </Transition>

        <button
          type="submit"
          :disabled="unlocking"
          class="group relative mt-0.5 flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-300/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200 dark:focus-visible:ring-black/20 dark:focus-visible:ring-offset-neutral-950"
        >
          <Icon v-if="unlocking" name="tabler:loader-2" class="size-4 animate-spin" />
          <Icon v-else name="tabler:lock-open" class="size-4" />
          {{ unlocking ? t('albums.scan.unlocking') : t('albums.scan.unlock') }}
        </button>
      </form>

      <Transition v-else name="kernel-msg" appear>
        <div class="relative flex flex-col items-center gap-3 px-8 pb-10 pt-4 text-center">
          <span class="grid size-12 place-items-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <Icon name="tabler:check" class="size-6 text-emerald-500" />
          </span>
          <p class="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            {{ t('albums.scan.passwordCorrect') }}
          </p>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.kernel-lock-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgb(0 0 0 / 0.06);
  border-radius: 1.75rem;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.94), rgb(246 246 248 / 0.9));
  backdrop-filter: saturate(160%) blur(26px);
  -webkit-backdrop-filter: saturate(160%) blur(26px);
  box-shadow:
    inset 0 0.5px 0 rgb(255 255 255 / 0.85),
    0 1px 2px rgb(0 0 0 / 0.04),
    0 22px 50px -26px rgb(0 0 0 / 0.2);
  animation: kernel-lock-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.dark .kernel-lock-card {
  border-color: rgb(255 255 255 / 0.12);
  background: linear-gradient(180deg, rgb(28 28 32 / 0.72), rgb(14 14 16 / 0.72));
  box-shadow:
    inset 0 0.5px 0 rgb(255 255 255 / 0.06),
    0 22px 55px -28px rgb(0 0 0 / 0.75);
}

@keyframes kernel-lock-rise {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes kernel-lock-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-9px); }
  40% { transform: translateX(9px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}
.kernel-lock-shake {
  animation: kernel-lock-shake 0.42s ease-in-out;
}

.kernel-lock-svg {
  --kd-body-hi: #eef1f4;
  --kd-body-mid: #c6ccd3;
  --kd-body-lo: #a6adb6;
  --kd-shackle-hi: #f7f8fa;
  --kd-shackle-lo: #adb4bd;
  --kd-keyhole: #3c434b;
  --kd-key-line: #7b838c;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.18));
}
.dark .kernel-lock-svg {
  --kd-body-hi: #3a3f47;
  --kd-body-mid: #262b32;
  --kd-body-lo: #16191d;
  --kd-shackle-hi: #6a737d;
  --kd-shackle-lo: #33383f;
  --kd-keyhole: #0c0e10;
  --kd-key-line: #c6ccd3;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}

.kernel-lock-key {
  opacity: 0;
  transform: translateX(20px);
  transform-origin: 24px 31px;
  transform-box: view-box;
}

.kd-try .kernel-lock-key {
  animation: kd-key-insert 0.75s ease forwards;
}
@keyframes kd-key-insert {
  0% { transform: translateX(20px) rotate(0deg); opacity: 0; }
  32% { transform: translateX(0) rotate(0deg); opacity: 1; }
  58% { transform: translateX(0) rotate(20deg); opacity: 1; }
  100% { transform: translateX(0) rotate(20deg); opacity: 1; }
}

.kd-open .kernel-lock-key {
  animation: kd-key-out 0.35s ease 0.45s forwards;
}
@keyframes kd-key-out {
  to { transform: translateX(0) rotate(-14deg); opacity: 0; }
}

.kd-error .kernel-lock-key {
  animation: kd-key-jam 0.5s ease forwards;
}
@keyframes kd-key-jam {
  0% { transform: translateX(0) rotate(20deg); opacity: 1; }
  25% { transform: translateX(0) rotate(46deg); opacity: 1; }
  50% { transform: translateX(0) rotate(2deg); opacity: 1; }
  72% { transform: translateX(0) rotate(-12deg); opacity: 1; }
  100% { transform: translateX(0) rotate(20deg); opacity: 1; }
}

.kernel-lock-shackle {
  transform-origin: 50% 34%;
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.15s;
}
.kd-open .kernel-lock-shackle {
  transform: rotate(14deg) translateY(-3px);
}

.kernel-lock-check {
  opacity: 0;
  transform: scale(0.5);
  transform-origin: 50% 50%;
  transition: opacity 0.3s ease 0.3s, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1) 0.3s;
}
.kernel-lock-check path {
  stroke-dasharray: 20;
  stroke-dashoffset: 20;
}
.kd-open .kernel-lock-check {
  opacity: 1;
  transform: scale(1);
}
.kd-open .kernel-lock-check path {
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 0.35s ease 0.55s;
}

@keyframes kernel-lock-jiggle {
  0%, 100% { transform: rotate(0deg); }
  14% { transform: rotate(-6deg) translateX(-2px); }
  30% { transform: rotate(5deg) translateX(2px); }
  46% { transform: rotate(-4deg); }
  60% { transform: rotate(3deg); }
  74% { transform: rotate(-2deg); }
  88% { transform: rotate(1deg); }
}
.kd-error {
  animation: kernel-lock-jiggle 0.55s cubic-bezier(0.34, 1.4, 0.64, 1);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)) drop-shadow(0 0 5px rgba(239, 68, 68, 0.3));
}

.kernel-lock-x {
  opacity: 0;
  transform: scale(0.4) rotate(-14deg);
  transform-origin: 50% 50%;
  transition: opacity 0.22s ease 0.25s, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1) 0.25s;
}
.kd-error .kernel-lock-x {
  opacity: 1;
  transform: scale(1) rotate(0deg);
}

.kernel-msg-enter-active,
.kernel-msg-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.kernel-msg-enter-from,
.kernel-msg-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>