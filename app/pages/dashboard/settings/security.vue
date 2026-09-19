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
  country: string | null
  region: string | null
  city: string | null
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

// ===== IP 归属地（中文化映射；离线库仅给出国家码/省码/英文城市名）=====
const COUNTRY_CN: Record<string, string> = {
  CN: '中国', US: '美国', JP: '日本', KR: '韩国', GB: '英国',
  DE: '德国', FR: '法国', IT: '意大利', ES: '西班牙', PT: '葡萄牙',
  NL: '荷兰', BE: '比利时', CH: '瑞士', AT: '奥地利', SE: '瑞典',
  NO: '挪威', DK: '丹麦', FI: '芬兰', PL: '波兰', CZ: '捷克',
  RU: '俄罗斯', UA: '乌克兰', SG: '新加坡', MY: '马来西亚', TH: '泰国',
  VN: '越南', PH: '菲律宾', ID: '印度尼西亚', IN: '印度', PK: '巴基斯坦',
  AU: '澳大利亚', NZ: '新西兰', CA: '加拿大', MX: '墨西哥', BR: '巴西',
  AR: '阿根廷', CL: '智利', PE: '秘鲁', CO: '哥伦比亚', VE: '委内瑞拉',
  ZA: '南非', EG: '埃及', NG: '尼日利亚', KE: '肯尼亚', MA: '摩洛哥',
  IL: '以色列', TR: '土耳其', SA: '沙特阿拉伯', AE: '阿联酋', QA: '卡塔尔',
  IR: '伊朗', KZ: '哈萨克斯坦', MN: '蒙古', HK: '香港', MO: '澳门',
  TW: '台湾', GR: '希腊', IE: '爱尔兰', RO: '罗马尼亚', HU: '匈牙利',
  BG: '保加利亚', HR: '克罗地亚', SK: '斯洛伐克', LT: '立陶宛', LV: '拉脱维亚',
  EE: '爱沙尼亚', IS: '冰岛', LU: '卢森堡', CY: '塞浦路斯',
}

const CN_REGION_CN: Record<string, string> = {
  BJ: '北京', TJ: '天津', SH: '上海', CQ: '重庆', HE: '河北', SX: '山西',
  NM: '内蒙古', LN: '辽宁', JL: '吉林', HL: '黑龙江', JS: '江苏', ZJ: '浙江',
  AH: '安徽', FJ: '福建', JX: '江西', SD: '山东', HA: '河南', HB: '湖北',
  HN: '湖南', GD: '广东', GX: '广西', HI: '海南', SC: '四川', GZ: '贵州',
  YN: '云南', XZ: '西藏', SN: '陕西', GS: '甘肃', QH: '青海', NX: '宁夏',
  XJ: '新疆', HK: '香港', MO: '澳门',
}

const CN_CITY_CN: Record<string, string> = {
  Beijing: '北京', Shanghai: '上海', Guangzhou: '广州', Shenzhen: '深圳',
  Hangzhou: '杭州', Chengdu: '成都', Wuhan: '武汉', Nanjing: '南京',
  "Xi'an": '西安', Xian: '西安', Chongqing: '重庆', Tianjin: '天津',
  Suzhou: '苏州', Qingdao: '青岛', Dalian: '大连', Xiamen: '厦门',
  Zhengzhou: '郑州', Changsha: '长沙', Shenyang: '沈阳', Harbin: '哈尔滨',
  Jinan: '济南', Kunming: '昆明', Fuzhou: '福州', Hefei: '合肥',
  Haikou: '海口', Guiyang: '贵阳', Nanning: '南宁', Lanzhou: '兰州',
  Urumqi: '乌鲁木齐', Shijiazhuang: '石家庄', Taiyuan: '太原',
}

// 依据国家码/省码/城市拼出可读归属地；解析不到（内网/未知）返回 null
const describeLocation = (log: LoginLog): string | null => {
  if (!log.country && !log.region && !log.city) return null
  const country = log.country ? (COUNTRY_CN[log.country] || log.country) : null
  if (log.country !== 'CN') {
    const city = log.city || null
    return [country, city].filter(Boolean).join(' · ') || null
  }
  const region = log.region ? (CN_REGION_CN[log.region] || log.region) : null
  const city = log.city ? (CN_CITY_CN[log.city] || log.city) : null
  if (city && region) return `中国 · ${region} · ${city}`
  return [country, city || region].filter(Boolean).join(' · ') || country
}

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
      <div class="mx-auto w-full max-w-5xl space-y-6 pb-10">
        <!-- 页头说明 -->
        <header class="flex items-end justify-between gap-4 pb-2">
          <div class="flex items-center gap-3">
            <span
              class="hidden size-10 shrink-0 items-center justify-center rounded-lg border border-(--ui-border) bg-muted text-(--ui-text-toned) sm:flex"
            >
              <UIcon name="tabler:shield" class="size-5" />
            </span>
            <div>
              <h2
                class="text-xl font-semibold tracking-tight text-(--ui-text-highlighted)"
              >
                {{ $t('settings.security.sectionTitle') }}
              </h2>
              <p class="mt-1 text-sm text-(--ui-text-muted)">
                {{ $t('settings.security.sectionDescription') }}
              </p>
            </div>
          </div>
        </header>

        <!-- 状态骨架 -->
        <UCard v-if="loadingState" variant="outline">
          <div class="space-y-4 px-1 py-2">
            <USkeleton class="h-5 w-52" />
            <USkeleton class="h-14 w-full" />
            <USkeleton class="h-20 w-full" />
          </div>
        </UCard>

        <!-- 两步验证状态与操作 -->
        <UCard v-else variant="outline">
          <!-- 头部：图标 + 标题 + 状态徽章 -->
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-(--ui-border) bg-muted text-(--ui-text-toned)"
                >
                  <UIcon name="tabler:shield-lock" class="size-5" />
                </span>
                <div>
                  <h3
                    class="text-base font-semibold text-(--ui-text-highlighted)"
                  >
                    {{ $t('settings.security.twoFactor.title') }}
                  </h3>
                  <p class="mt-0.5 text-sm text-(--ui-text-muted)">
                    {{ $t('settings.security.twoFactor.description') }}
                  </p>
                </div>
              </div>

              <span
                class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
                :class="
                  enabled
                    ? 'border-emerald-300/40 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-neutral-200 bg-neutral-100 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300'
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
          </template>

          <!-- 正文：状态提示 + 操作 -->
          <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <!-- 状态横幅 -->
            <div
              class="flex min-w-0 items-start gap-3 rounded-lg border p-3.5"
              :class="
                enabled
                  ? 'border-emerald-300/40 bg-emerald-50/70 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-200'
                  : 'border-(--ui-border) bg-muted/60 text-(--ui-text-muted)'
              "
            >
              <UIcon
                :name="enabled ? 'tabler:shield-check' : 'tabler:shield-exclamation'"
                class="mt-0.5 size-5 shrink-0"
                :class="enabled ? 'text-emerald-600 dark:text-emerald-400' : ''"
              />
              <p class="min-w-0 text-sm leading-relaxed">
                {{
                  $t(
                    enabled
                      ? 'settings.security.twoFactor.enabledNotice'
                      : 'settings.security.twoFactor.disabledNotice',
                  )
                }}
              </p>
            </div>

            <!-- 操作按钮 -->
            <div class="shrink-0">
              <UButton
                v-if="!enabled && !setup"
                color="primary"
                icon="tabler:shield-plus"
                :loading="enabling"
                @click="startSetup"
              >
                {{ $t('settings.security.twoFactor.enableAction') }}
              </UButton>
              <div v-else-if="enabled" class="flex flex-col items-start gap-1.5 sm:items-end">
                <UButton
                  color="error"
                  variant="outline"
                  icon="tabler:shield-off"
                  @click="openDisable"
                >
                  {{ $t('settings.security.twoFactor.disableAction') }}
                </UButton>
                <p class="text-xs text-amber-600 dark:text-amber-400">
                  {{ $t('settings.security.twoFactor.cutoffHint') }}
                </p>
              </div>
            </div>
          </div>
        </UCard>

        <!-- 设置步骤：二维码 -->
        <UCard v-if="setup" variant="outline">
          <template #header>
            <div class="flex items-center gap-3">
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-(--ui-border) bg-muted text-(--ui-text-toned)"
              >
                <UIcon name="tabler:qrcode" class="size-5" />
              </span>
              <h3
                class="text-base font-semibold text-(--ui-text-highlighted)"
              >
                {{ $t('settings.security.twoFactor.setupTitle') }}
              </h3>
            </div>
          </template>

          <div class="space-y-6 px-1 py-2">
            <p class="text-sm text-(--ui-text-muted)">
              {{ $t('settings.security.twoFactor.setupScanHint') }}
            </p>

            <!-- 二维码 -->
            <div class="flex justify-center">
              <img
                v-if="setup.qr"
                :src="setup.qr"
                alt="2FA QR code"
                class="size-52 rounded-xl border border-(--ui-border) bg-white p-2.5"
              />
              <USkeleton v-else class="size-52 rounded-xl" />
            </div>

            <!-- 手动密钥 -->
            <div
              v-if="setup.secret"
              class="flex items-center justify-between gap-3 rounded-lg border border-(--ui-border) bg-muted/50 px-4 py-3"
            >
              <div class="min-w-0">
                <p
                  class="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-(--ui-text-dimmed)"
                >
                  {{ $t('settings.security.twoFactor.secretLabel') }}
                </p>
                <p
                  class="mt-1 select-all truncate font-mono text-sm tracking-[0.15em] text-(--ui-text)"
                >
                  {{ setup.secret }}
                </p>
              </div>
              <UButton
                color="neutral"
                variant="outline"
                icon="tabler:copy"
                class="shrink-0"
                @click="copySecret"
              >
                {{
                  copied
                    ? $t('settings.security.twoFactor.copied')
                    : $t('settings.security.twoFactor.copySecret')
                }}
              </UButton>
            </div>

            <!-- 确认验证码 -->
            <div class="space-y-3">
              <div>
                <p
                  class="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-(--ui-text-dimmed)"
                >
                  {{ $t('settings.security.twoFactor.codeLabel') }}
                </p>
                <p class="mt-0.5 text-sm text-(--ui-text-muted)">
                  {{ $t('settings.security.twoFactor.codeHint') }}
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2.5">
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
                  icon="tabler:shield-check"
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
        </UCard>

        <!-- 登入记录 -->
        <UCard variant="outline">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-(--ui-border) bg-muted text-(--ui-text-toned)"
                >
                  <UIcon name="tabler:login" class="size-5" />
                </span>
                <div>
                  <h3
                    class="text-base font-semibold text-(--ui-text-highlighted)"
                  >
                    {{ $t('settings.security.loginRecords.title') }}
                  </h3>
                  <p class="mt-0.5 text-sm text-(--ui-text-muted)">
                    {{ $t('settings.security.loginRecords.description') }}
                  </p>
                </div>
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
            </div>
          </template>

          <!-- 内容：骨架 / 空态 / 列表 -->
          <div>
            <!-- 加载骨架 -->
            <div v-if="logLoading" class="space-y-3 px-1 py-3">
              <USkeleton v-for="i in 4" :key="i" class="h-12 w-full rounded-lg" />
            </div>

            <!-- 空状态 -->
            <div
              v-else-if="logs.length === 0"
              class="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
            >
              <span
                class="flex size-12 items-center justify-center rounded-full bg-muted text-(--ui-text-dimmed)"
              >
                <UIcon name="tabler:history" class="size-6" />
              </span>
              <p class="text-sm text-(--ui-text-muted)">
                {{ $t('settings.security.loginRecords.empty') }}
              </p>
            </div>

            <!-- 记录列表 -->
            <ul v-else class="divide-y divide-(--ui-border-muted)">
              <li
                v-for="log in logs"
                :key="log.id"
                class="group flex items-center gap-3.5 px-1 py-3.5 sm:gap-4 sm:px-2"
              >
                <!-- 状态图标 -->
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-lg border"
                  :class="{
                    'border-emerald-300/40 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-400':
                      log.status === 'success',
                    'border-red-300/40 bg-red-50 text-red-600 dark:border-red-400/20 dark:bg-red-950/40 dark:text-red-400':
                      log.status === 'failed',
                    'border-amber-300/40 bg-amber-50 text-amber-600 dark:border-amber-400/20 dark:bg-amber-950/40 dark:text-amber-400':
                      log.status === 'challenge',
                  }"
                >
                  <UIcon :name="statusIcon[log.status]" class="size-5" />
                </span>

                <!-- 主体信息 -->
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      class="text-sm font-semibold"
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
                      class="inline-flex items-center gap-1 rounded-full border border-(--ui-border) bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-(--ui-text-toned)"
                    >
                      <UIcon :name="methodIcon[log.method]" class="size-3" />
                      {{
                        $t(
                          `settings.security.loginRecords.method.${log.method}`,
                        )
                      }}
                    </span>
                  </div>

                  <p
                    class="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
                  >
                    <!-- 归属地（离线库解析） -->
                    <span
                      class="inline-flex items-center gap-1 font-medium text-(--ui-text-toned)"
                    >
                      <UIcon name="tabler:map-pin" class="size-3.5 shrink-0" />
                      <span class="truncate">
                        {{
                          describeLocation(log) ||
                          $t('settings.security.loginRecords.locationUnknown')
                        }}
                      </span>
                    </span>
                    <span class="opacity-40">·</span>
                    <span class="truncate font-mono text-(--ui-text-dimmed)">
                      {{ log.ip || $t('settings.security.loginRecords.unknownIp') }}
                    </span>
                    <template v-if="parseDevice(log.userAgent)">
                      <span class="opacity-40">·</span>
                      <span class="truncate text-(--ui-text-dimmed)">
                        {{ parseDevice(log.userAgent) }}
                      </span>
                    </template>
                  </p>
                </div>

                <!-- 时间 -->
                <time
                  class="shrink-0 text-xs tabular-nums text-(--ui-text-dimmed)"
                >
                  {{ formatLogTime(log.createdAt) }}
                </time>
              </li>
            </ul>
          </div>
        </UCard>
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
        <div>
          <UInput
            v-model="disableCode"
            inputmode="numeric"
            maxlength="8"
            placeholder="••••••"
            class="w-full [&>input]:!text-center [&>input]:!tracking-[0.4em]"
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
            icon="tabler:shield-off"
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