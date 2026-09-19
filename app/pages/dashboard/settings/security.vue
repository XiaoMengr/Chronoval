<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.securitySettings'),
})

const toast = useToast()

// 2FA 当前状态：null=加载中；true/false=是否开启
const enabled = ref<boolean | null>(null)
const loadingState = ref(true)

// 设置流程
const setup = ref<{
  qr: string | null
  secret: string | null
  account: string | null
} | null>(null)
const setupCode = ref('')
const setupSubmitting = ref(false)
const enabling = ref(false)

// 关闭流程
const disableOpen = ref(false)
const disableCode = ref('')
const disableSubmitting = ref(false)

const copied = ref(false)

const loadStatus = async () => {
  try {
    const { enabled: isEnabled } = await $fetch<{ enabled: boolean }>(
      '/api/auth/2fa/status',
    )
    enabled.value = isEnabled
  } catch (error) {
    console.error('Failed to load 2FA status:', error)
    toast.add({
      color: 'error',
      icon: 'tabler:alert-triangle',
      title: $t('settings.security.loadFailed'),
    })
  } finally {
    loadingState.value = false
  }
}

onMounted(loadStatus)

const startSetup = async () => {
  enabling.value = true
  try {
    const res = await $fetch<{
      enabled: boolean
      qr: string | null
      secret: string | null
      account: string | null
    }>('/api/auth/2fa/setup', { method: 'POST' })
    if (res.enabled) {
      enabled.value = true
      return
    }
    setup.value = { qr: res.qr, secret: res.secret, account: res.account }
  } catch (error) {
    console.error('Failed to start 2FA setup:', error)
  } finally {
    enabling.value = false
  }
}

const confirmSetup = async () => {
  const code = setupCode.value.trim()
  if (!/^\d{6,8}$/.test(code)) {
    toast.add({
      color: 'error',
      title: $t('settings.security.twoFactor.confirmError'),
    })
    return
  }
  setupSubmitting.value = true
  try {
    await $fetch('/api/auth/2fa/confirm', {
      method: 'POST',
      body: { code },
    })
    enabled.value = true
    setup.value = null
    setupCode.value = ''
    toast.add({
      color: 'success',
      icon: 'tabler:circle-check',
      title: $t('settings.security.twoFactor.confirmSuccess'),
    })
  } catch (error) {
    toast.add({
      color: 'error',
      title: $t('settings.security.twoFactor.confirmError'),
    })
  } finally {
    setupSubmitting.value = false
  }
}

const cancelSetup = () => {
  setup.value = null
  setupCode.value = ''
}

const openDisable = () => {
  disableCode.value = ''
  disableOpen.value = true
}

const confirmDisable = async () => {
  const code = disableCode.value.trim()
  if (!/^\d{6,8}$/.test(code)) {
    toast.add({
      color: 'error',
      title: $t('settings.security.twoFactor.disableError'),
    })
    return
  }
  disableSubmitting.value = true
  try {
    await $fetch('/api/auth/2fa/disable', {
      method: 'POST',
      body: { code },
    })
    enabled.value = false
    disableOpen.value = false
    disableCode.value = ''
    toast.add({
      color: 'success',
      icon: 'tabler:circle-check',
      title: $t('settings.security.twoFactor.disableSuccess'),
    })
  } catch (error) {
    toast.add({
      color: 'error',
      title: $t('settings.security.twoFactor.disableError'),
    })
  } finally {
    disableSubmitting.value = false
  }
}

const copySecret = async () => {
  if (!setup.value?.secret) return
  try {
    await navigator.clipboard.writeText(setup.value.secret)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    /* clipboard unavailable */
  }
}

// ===== 登入记录 =====
interface LoginLog {
  id: number
  userId: number | null
  email: string
  ip: string | null
  userAgent: string | null
  method: 'password' | 'two-factor' | 'github'
  status: 'success' | 'failed' | 'challenge'
  createdAt: string
}

const dayjs = useDayjs()
const logs = ref<LoginLog[]>([])
const logLoading = ref(true)
const logRefreshing = ref(false)

const statusIcon: Record<LoginLog['status'], string> = {
  success: 'tabler:circle-check',
  failed: 'tabler:circle-x',
  challenge: 'tabler:clock-hour-3',
}

const methodIcon: Record<LoginLog['method'], string> = {
  password: 'tabler:key',
  'two-factor': 'tabler:shield-lock',
  github: 'tabler:brand-github',
}

// 从 User-Agent 提取 浏览器 · 系统 的可读标签（尽力解析，不做完整 UA 库）
const parseDevice = (ua: string | null) => {
  if (!ua) return ''
  let os = ''
  if (/windows/i.test(ua)) os = 'Windows'
  else if (/macintosh|mac os/i.test(ua)) os = 'macOS'
  else if (/iphone|ipad/i.test(ua)) os = 'iOS'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/linux/i.test(ua)) os = 'Linux'
  let browser = ''
  if (/edg\/|edge\//i.test(ua)) browser = 'Edge'
  else if (/opr\//i.test(ua)) browser = 'Opera'
  else if (/chrome\/|crios\//i.test(ua)) browser = 'Chrome'
  else if (/firefox\//i.test(ua)) browser = 'Firefox'
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari'
  return [browser, os].filter(Boolean).join(' · ')
}

const formatLogTime = (ts: string) =>
  dayjs(ts).isValid() ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '—'

const loadLogs = async (refreshing = false) => {
  if (refreshing) logRefreshing.value = true
  try {
    logs.value = await $fetch<LoginLog[]>('/api/auth/login-logs?limit=50')
  } catch (error) {
    console.error('Failed to load login records:', error)
    toast.add({
      color: 'error',
      icon: 'tabler:alert-triangle',
      title: $t('settings.security.loginRecords.loadFailed'),
    })
  } finally {
    logLoading.value = false
    logRefreshing.value = false
  }
}

onMounted(() => {
  loadLogs()
})
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.securitySettings')" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section
          class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800"
        >
          <h2
            class="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {{ $t('settings.security.sectionTitle') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            {{ $t('settings.security.sectionDescription') }}
          </p>
        </section>

        <!-- 状态骨架 -->
        <section
          v-if="loadingState"
          class="rounded-md border border-neutral-200 bg-white px-5 py-6 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <USkeleton class="h-5 w-52" />
          <USkeleton class="mt-4 h-14 w-full" />
        </section>

        <!-- 两步验证状态与操作 -->
        <section
          v-else
          class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
        >
          <header
            class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h3
                class="text-base font-semibold text-neutral-900 dark:text-neutral-100"
              >
                {{ $t('settings.security.twoFactor.title') }}
              </h3>
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="
                  enabled
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                "
              >
                <span
                  class="size-1.5 rounded-full"
                  :class="enabled ? 'bg-emerald-500' : 'bg-neutral-400'"
                />
                {{
                  $t(
                    enabled
                      ? 'settings.security.twoFactor.enabledBadge'
                      : 'settings.security.twoFactor.disabledBadge',
                  )
                }}
              </span>
            </div>
          </header>

          <div class="space-y-4 px-5 py-5">
            <p
              class="rounded-md px-3 py-2 text-sm"
              :class="
                enabled
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400'
              "
            >
              {{
                $t(
                  enabled
                    ? 'settings.security.twoFactor.enabledNotice'
                    : 'settings.security.twoFactor.disabledNotice',
                )
              }}
            </p>

            <p class="text-sm text-neutral-600 dark:text-neutral-400">
              {{ $t('settings.security.twoFactor.description') }}
            </p>

            <!-- 未开启：执行设置 -->
            <div v-if="!enabled && !setup" class="pt-1">
              <UButton
                color="primary"
                icon="tabler:shield-lock-plus"
                :loading="enabling"
                @click="startSetup"
              >
                {{ $t('settings.security.twoFactor.enableAction') }}
              </UButton>
            </div>

            <!-- 已开启：可关闭 -->
            <div v-else-if="enabled" class="flex flex-col gap-2 pt-1">
              <UButton
                color="error"
                variant="outline"
                icon="tabler:shield-lock-off"
                @click="openDisable"
              >
                {{ $t('settings.security.twoFactor.disableAction') }}
              </UButton>
              <p class="text-xs text-amber-600 dark:text-amber-400">
                {{ $t('settings.security.twoFactor.cutoffHint') }}
              </p>
            </div>
          </div>
        </section>

        <!-- 设置步骤：二维码 -->
        <section
          v-if="setup"
          class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
        >
          <header
            class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800"
          >
            <h3
              class="text-base font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {{ $t('settings.security.twoFactor.setupTitle') }}
            </h3>
          </header>

          <div class="space-y-5 px-5 py-6">
            <p class="text-sm text-neutral-600 dark:text-neutral-400">
              {{ $t('settings.security.twoFactor.setupScanHint') }}
            </p>

            <!-- 二维码 -->
            <div class="flex justify-center">
              <img
                v-if="setup.qr"
                :src="setup.qr"
                alt="2FA QR code"
                class="size-56 rounded-lg border border-neutral-200 p-2 dark:border-neutral-800"
              />
              <USkeleton v-else class="size-56 rounded-lg" />
            </div>

            <!-- 手动密钥 -->
            <div
              v-if="setup.secret"
              class="flex items-center justify-between gap-3 rounded-md border border-neutral-200 px-4 py-3 dark:border-neutral-800"
            >
              <div class="min-w-0">
                <p
                  class="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-neutral-500"
                >
                  {{ $t('settings.security.twoFactor.secretLabel') }}
                </p>
                <p
                  class="mt-0.5 select-all font-mono text-sm tracking-wider text-neutral-800 dark:text-neutral-200"
                >
                  {{ setup.secret }}
                </p>
              </div>
              <UButton
                color="neutral"
                variant="outline"
                icon="tabler:copy"
                :label="
                  copied
                    ? $t('settings.security.twoFactor.copied')
                    : $t('settings.security.twoFactor.copySecret')
                "
                @click="copySecret"
              />
            </div>

            <!-- 确认验证码 -->
            <div class="space-y-2">
              <p
                class="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-neutral-500"
              >
                {{ $t('settings.security.twoFactor.codeLabel') }}
              </p>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                {{ $t('settings.security.twoFactor.codeHint') }}
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <UInput
                  v-model="setupCode"
                  inputmode="numeric"
                  maxlength="8"
                  placeholder="••••••"
                  class="w-48 [&>input]:!text-center [&>input]:!tracking-[0.4em]"
                  @keyup.enter="confirmSetup"
                />
                <UButton
                  color="primary"
                  icon="tabler:shield-lock-check"
                  :loading="setupSubmitting"
                  @click="confirmSetup"
                >
                  {{ $t('settings.security.twoFactor.confirmAction') }}
                </UButton>
                <UButton
                  color="neutral"
                  variant="ghost"
                  :disabled="setupSubmitting"
                  @click="cancelSetup"
                >
                  {{ $t('settings.security.twoFactor.cancelAction') }}
                </UButton>
              </div>
            </div>
          </div>
        </section>

        <!-- 登入记录 -->
        <section
          class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
        >
          <header
            class="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800"
          >
            <div>
              <h3
                class="text-base font-semibold text-neutral-900 dark:text-neutral-100"
              >
                {{ $t('settings.security.loginRecords.title') }}
              </h3>
              <p class="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                {{ $t('settings.security.loginRecords.description') }}
              </p>
            </div>
            <UButton
              color="neutral"
              variant="outline"
              icon="tabler:refresh"
              :loading="logRefreshing"
              @click="loadLogs(true)"
            >
              {{ $t('settings.security.loginRecords.refresh') }}
            </UButton>
          </header>

          <div>
            <!-- 加载骨架 -->
            <div
              v-if="logLoading"
              class="space-y-3 px-5 py-5"
            >
              <USkeleton v-for="i in 4" :key="i" class="h-12 w-full" />
            </div>

            <!-- 空状态 -->
            <p
              v-else-if="logs.length === 0"
              class="px-5 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400"
            >
              {{ $t('settings.security.loginRecords.empty') }}
            </p>

            <!-- 记录列表 -->
            <ul
              v-else
              class="divide-y divide-neutral-100 dark:divide-neutral-800"
            >
              <li
                v-for="log in logs"
                :key="log.id"
                class="flex items-center gap-4 px-5 py-4"
              >
                <!-- 状态图标 -->
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-md"
                  :class="{
                    'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400':
                      log.status === 'success',
                    'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400':
                      log.status === 'failed',
                    'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400':
                      log.status === 'challenge',
                  }"
                >
                  <UIcon :name="statusIcon[log.status]" class="size-5" />
                </span>

                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      class="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                      :class="{
                        'text-emerald-700 dark:text-emerald-300':
                          log.status === 'success',
                        'text-red-600 dark:text-red-400':
                          log.status === 'failed',
                        'text-amber-600 dark:text-amber-400':
                          log.status === 'challenge',
                      }"
                    >
                      {{
                        $t(
                          `settings.security.loginRecords.status.${log.status}`,
                        )
                      }}
                    </span>
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[0.7rem] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      <UIcon :name="methodIcon[log.method]" class="size-3" />
                      {{
                        $t(
                          `settings.security.loginRecords.method.${log.method}`,
                        )
                      }}
                    </span>
                  </div>
                  <p class="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                    <span class="font-mono">
                      {{ log.ip || $t('settings.security.loginRecords.unknownIp') }}
                    </span>
                    <template v-if="parseDevice(log.userAgent)">
                      <span class="mx-1 opacity-50">·</span>{{ parseDevice(log.userAgent) }}
                    </template>
                  </p>
                </div>

                <time
                  class="shrink-0 text-xs tabular-nums text-neutral-400 dark:text-neutral-500"
                >
                  {{ formatLogTime(log.createdAt) }}
                </time>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>

  <!-- 关闭两步验证确认 -->
  <UModal
    v-model:open="disableOpen"
    :title="$t('settings.security.twoFactor.disableTitle')"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-(--ui-text-muted)">
          {{ $t('settings.security.twoFactor.disableHint') }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="disableCode"
            inputmode="numeric"
            maxlength="8"
            placeholder="••••••"
            class="w-48 [&>input]:!text-center [&>input]:!tracking-[0.4em]"
            @keyup.enter="confirmDisable"
          />
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            :disabled="disableSubmitting"
            @click="disableOpen = false"
          >
            {{ $t('settings.security.actions.cancel') }}
          </UButton>
          <UButton
            color="error"
            icon="tabler:shield-lock-off"
            :loading="disableSubmitting"
            @click="confirmDisable"
          >
            {{ $t('settings.security.twoFactor.disableAction') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>