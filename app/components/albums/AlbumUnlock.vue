<script lang="ts" setup>
/**
 * 相簿解锁（极简风格）。
 *
 * 整屏居中的留白排版：小锁徽标 + 相簿标题 + 下划线式密码输入 + 纯色胶囊按钮。
 * 无卡片边框、无复杂动画，仅保留：入场浮现、输错轻抖、成功一笔对勾。
 * 解锁成功后向父级 emit('success')，由父级刷新相簿内容。
 */
const props = defineProps<{
  /** 相簿 id（用于调用解锁接口） */
  albumId: number
  /** 相簿标题（可选，展示在解锁界面顶部的小字标签） */
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
// 每次解锁失败自增，作为 error-key 触发轻抖动画
const shakeKey = ref(0)

const inputRef = ref<HTMLInputElement | null>(null)
onMounted(() => {
  inputRef.value?.focus()
  // 标记 Vue 已水合接管：兜底脚本此后不再拦截提交
  ;(window as any).__albumUnlockHydrated = true
})

// —— 水合前兜底（与登录表单同一套路）——
// dev 模式或弱网下，用户可能在 Vue 水合完成前就输入密码并点击“解锁”；
// 此时 @submit 尚未接管，原生提交只会静默刷新页面。此脚本捕获阶段拦截
// 表单提交，直接 fetch 解锁接口：成功 reload（Cookie 已授权），失败就地报错。
useHead({
  script: [
    {
      tagPosition: 'bodyClose',
      innerHTML: `(function(){
  if (window.__albumUnlockFallback) return
  window.__albumUnlockFallback = true
  var MSG = {
    required: ${JSON.stringify(t('albums.scan.passwordRequired'))},
    wrong: ${JSON.stringify(t('albums.scan.wrongPassword'))},
    failed: ${JSON.stringify(t('albums.scan.unlockError'))},
    busy: ${JSON.stringify(t('albums.scan.unlocking'))}
  }
  function showErr(form, msg){
    var old = form.querySelector('.unlock-fb-err')
    if (old) old.remove()
    var p = document.createElement('p')
    p.className = 'unlock-fb-err'
    p.style.cssText = 'margin-top:0.75rem;text-align:center;font-size:0.75rem;font-weight:500;color:#ef4444'
    p.textContent = msg
    form.appendChild(p)
  }
  document.addEventListener('submit', function(e){
    var form = e.target
    if (!form || !form.matches || !form.matches('form[data-album-unlock]')) return
    if (window.__albumUnlockHydrated) return
    e.preventDefault()
    e.stopPropagation()
    var input = form.querySelector('input[type=password]')
    var pw = input ? input.value : ''
    var id = form.getAttribute('data-album-id')
    var btn = form.querySelector('button[type=submit]')
    if (!pw) return showErr(form, MSG.required)
    if (btn) { btn.disabled = true; btn.setAttribute('data-label', btn.textContent); btn.textContent = MSG.busy }
    fetch('/api/albums/' + id + '/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    }).then(function(r){
      if (r.ok) { location.reload() }
      else {
        if (btn) { btn.disabled = false; btn.textContent = btn.getAttribute('data-label') }
        showErr(form, r.status === 401 ? MSG.wrong : MSG.failed)
      }
    }).catch(function(){
      if (btn) { btn.disabled = false; btn.textContent = btn.getAttribute('data-label') }
      showErr(form, MSG.failed)
    })
  }, true)
})()`,
    },
  ],
})


const onSubmitPassword = async () => {
  if (unlocking.value) return // 防止并发/重复提交
  unlockError.value = null
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
    passwordInput.value = ''
    unlockSuccess.value = true
    // 短暂展示“密码正确”的对勾反馈，再切换到相簿内容
    await new Promise((r) => setTimeout(r, 600))
    emit('success')
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number })?.statusCode
    unlockError.value =
      statusCode === 401
        ? t('albums.scan.wrongPassword')
        : t('albums.scan.unlockError')
    shakeKey.value++
    unlocking.value = false
  }
}
</script>

<template>
  <div
    class="relative flex min-h-[72vh] items-center justify-center overflow-hidden px-6 py-20"
  >
    <!-- 极淡的一次柔光，给留白一点空气感 -->
    <div
      class="unlock-halo pointer-events-none absolute inset-0"
      aria-hidden="true"
    />

    <div
      :key="shakeKey"
      :class="unlockError ? 'unlock-shake' : ''"
      class="unlock-rise relative w-full max-w-72"
    >
      <!-- 顶部小锁徽标 -->
      <div class="flex justify-center">
        <span
          class="grid size-11 place-items-center rounded-full bg-black/[0.04] text-neutral-400 ring-1 ring-black/[0.06] dark:bg-white/[0.06] dark:text-neutral-500 dark:ring-white/[0.08]"
        >
          <Icon
            :name="unlockSuccess ? 'tabler:lock-open-2' : 'tabler:lock'"
            class="size-[18px]"
          />
        </span>
      </div>

      <!-- 相簿标题（小字间距标签） -->
      <p
        v-if="title"
        class="mt-5 truncate text-center text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500"
      >
        {{ title }}
      </p>

      <!-- 标题与说明 -->
      <h2
        class="mt-2 text-center text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100"
      >
        {{ t('albums.scan.lockedTitle') }}
      </h2>
      <p
        class="mt-1.5 text-center text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400"
      >
        {{ t('albums.scan.lockedHint') }}
      </p>

      <!-- 密码输入（下划线式） -->
      <form
        v-if="!unlockSuccess"
        class="mt-9"
        data-album-unlock
        :data-album-id="albumId"
        @submit.prevent="onSubmitPassword"
      >
        <input
          ref="inputRef"
          v-model="passwordInput"
          type="password"
          :placeholder="t('albums.scan.passwordPlaceholder')"
          autocomplete="current-password"
          :disabled="unlocking"
          class="unlock-input size-full w-full rounded-none border-0 border-b border-neutral-300 bg-transparent px-1 py-2.5 text-center text-[15px] tracking-[0.35em] text-neutral-900 caret-neutral-900 outline-none transition-colors duration-300 placeholder:tracking-[0.08em] placeholder:text-neutral-300 focus:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-100 dark:caret-white dark:placeholder:text-neutral-600 dark:focus:border-white"
        />

        <Transition name="unlock-msg" mode="out-in">
          <p
            v-if="unlockError"
            key="err"
            class="mt-3 text-center text-xs font-medium text-red-500"
          >
            {{ unlockError }}
          </p>
        </Transition>

        <button
          type="submit"
          :disabled="unlocking"
          class="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-neutral-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <Icon
            v-if="unlocking"
            name="tabler:loader-2"
            class="size-4 animate-spin"
          />
          {{ unlocking ? t('albums.scan.unlocking') : t('albums.scan.unlock') }}
        </button>
      </form>

      <!-- 成功：一笔对勾 -->
      <Transition v-else name="unlock-done" appear>
        <div class="mt-9 flex items-center justify-center gap-2">
          <svg viewBox="0 0 20 20" class="size-4" aria-hidden="true">
            <path
              class="unlock-check-path"
              d="M3.5 10.5 L8 15 L16.5 5.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <p
            class="text-sm font-medium text-emerald-600 dark:text-emerald-400"
          >
            {{ t('albums.scan.passwordCorrect') }}
          </p>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
/* 柔光：中性、极淡，浅暗两套 */
.unlock-halo {
  background: radial-gradient(
    46% 52% at 50% 42%,
    rgba(0, 0, 0, 0.035),
    transparent 72%
  );
}
.dark .unlock-halo {
  background: radial-gradient(
    46% 52% at 50% 42%,
    rgba(255, 255, 255, 0.05),
    transparent 72%
  );
}

/* 入场：整体自下轻轻浮现 */
.unlock-rise {
  animation: unlock-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes unlock-rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 输错：小幅轻抖，克制不夸张 */
.unlock-shake {
  animation: unlock-shake 0.36s ease-in-out;
}
@keyframes unlock-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-5px);
  }
  50% {
    transform: translateX(4px);
  }
  75% {
    transform: translateX(-2px);
  }
}

/* 错误提示淡入 */
.unlock-msg-enter-active,
.unlock-msg-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.unlock-msg-enter-from,
.unlock-msg-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

/* 成功对勾：路径描画 + 轻微上浮 */
.unlock-done-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.unlock-done-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.unlock-check-path {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  animation: unlock-check-draw 0.4s ease 0.1s forwards;
}
@keyframes unlock-check-draw {
  to {
    stroke-dashoffset: 0;
  }
}
</style>
