<script lang="ts" setup>
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const router = useRouter()
const { loggedIn, user, clear } = useUserSession()
const settingsStore = useSettingsStore()

const appTitle = computed(() => {
  const value = settingsStore.getSetting('app:title')
  return value ? String(value) : $t('title.dashboard')
})

const navItems = computed<NavigationMenuItem[][]>(() => [
  [
    {
      label: $t('title.dashboard'),
      icon: 'tabler:dashboard',
      to: '/dashboard',
      class: '[&_.iconify]:!text-blue-500',
    },
    {
      label: $t('title.photos'),
      icon: 'tabler:photo-cog',
      to: '/dashboard/photos',
      class: '[&_.iconify]:!text-emerald-500',
    },
    {
      label: $t('dashboard.nav.albums'),
      icon: 'tabler:album',
      to: '/dashboard/albums',
      class: '[&_.iconify]:!text-violet-500',
    },
    {
      label: $t('title.queue'),
      icon: 'tabler:list-check',
      to: '/dashboard/queue',
      class: '[&_.iconify]:!text-amber-500',
    },
    {
      label: $t('title.logs'),
      icon: 'tabler:file-text',
      to: '/dashboard/logs',
      class: '[&_.iconify]:!text-sky-500',
    },
    {
      label: $t('title.siteAdministration'),
      icon: 'tabler:settings',
      defaultOpen: route.path.startsWith('/dashboard/settings'),
      class: '[&_.iconify]:!text-teal-500',
      children: [
        {
          label: $t('title.generalSettings'),
          icon: 'tabler:settings-2',
          to: '/dashboard/settings/general',
          class: '[&_.iconify]:!text-blue-500',
        },
        {
          label: $t('title.interfaceSettings'),
          icon: 'tabler:palette',
          to: '/dashboard/settings/interface',
          class: '[&_.iconify]:!text-fuchsia-500',
        },
        {
          label: $t('title.storageSettings'),
          icon: 'tabler:database',
          to: '/dashboard/settings/storage',
          class: '[&_.iconify]:!text-emerald-500',
        },
        {
          label: $t('title.privacySettings'),
          icon: 'tabler:shield-lock',
          to: '/dashboard/settings/privacy',
          class: '[&_.iconify]:!text-violet-500',
        },
        {
          label: $t('title.securitySettings'),
          icon: 'tabler:user-shield',
          to: '/dashboard/settings/security',
          class: '[&_.iconify]:!text-pink-500',
        },
        {
          label: $t('title.mapAndLocation'),
          icon: 'tabler:map-pin',
          to: '/dashboard/settings/map',
          class: '[&_.iconify]:!text-amber-500',
        },
        {
          label: $t('title.systemSettings'),
          icon: 'tabler:cpu',
          to: '/dashboard/settings/system',
          class: '[&_.iconify]:!text-sky-500',
        },
        {
          label: $t('title.analyticsSettings'),
          icon: 'tabler:chart-bar',
          to: '/dashboard/settings/analytics',
          class: '[&_.iconify]:!text-rose-500',
        },
      ],
    },
    {
      label: $t('title.trash'),
      icon: 'tabler:trash',
      to: '/dashboard/trash',
      // 仅删除图标标红，整行保持普通导航样式
      class: '[&_.iconify]:!text-(--ui-error)',
    },
  ],
  [
    {
      label: $t('dashboard.nav.home'),
      icon: 'tabler:home',
      to: '/',
    },
    {
      label: 'GitHub',
      icon: 'tabler:brand-github',
      to: 'https://github.com/HoshinoSuzumi/chronoframe',
      target: '_blank',
    },
    {
      label: $t('dashboard.nav.documentation'),
      icon: 'tabler:book',
      to: 'https://chronoframe.bh8.ga/',
      target: '_blank',
    },
    {
      label: 'Discord',
      icon: 'tabler:brand-discord',
      to: 'https://discord.gg/MM4ZK4Ed7s',
      target: '_blank',
    },
  ],
])

useHead({
  title: () => $t('title.dashboard'),
  titleTemplate: (title) => `${title ? `${title} | ` : ''}${appTitle.value}`,
})

onMounted(() => {
  document.body.classList.add('dashboard-active')
})

onBeforeUnmount(() => {
  document.body.classList.remove('dashboard-active')
})

const handleLogin = () => {
  router.push({
    path: '/login',
    query: { redirect: route.fullPath },
  })
}

// 退出登录：从管理后台跳回首页（登出后 loggedIn 为 false，管理端自动拒绝访问）
const handleLogout = async () => {
  try {
    await clear()
  } finally {
    await router.push('/')
  }
}
</script>

<template>
  <!-- TODO: unified error page -->
  <div
    v-if="!loggedIn || !user?.isAdmin"
    class="h-svh flex flex-col gap-4 items-center justify-center px-4"
  >
    <Icon
      name="tabler:alert-triangle"
      class="size-12 text-primary"
    />
    <p class="text-gray-500 text-center">
      {{
        !user?.isAdmin
          ? $t('dashboard.access.pleaseLogin')
          : $t('dashboard.access.noAccess')
      }}
    </p>
    <UButton @click="handleLogin">{{ $t('auth.form.signin.title') }}</UButton>
  </div>
  <UDashboardGroup v-else class="dashboard-root">
    <UDashboardSidebar
      id="cframe-dashboard-sidebar"
      resizable
      collapsible
      mode="drawer"
      :min-size="8"
      :max-size="12"
      :ui="{ footer: 'border-t border-default' }"
      :toggle="{
        color: 'primary',
        variant: 'subtle',
        class: 'rounded-full',
      }"
    >
      <template #toggle>
        <UDashboardSidebarToggle variant="soft" />
      </template>

      <template #header="{ collapsed }">
        <div
          v-if="!collapsed"
          class="flex items-center gap-2"
        >
          <img
            src="/favicon.svg"
            class="h-8 w-auto shrink-0"
          />
          <div class="flex flex-col overflow-hidden">
            <NuxtLink
              to="/"
              class="text-lg font-medium line-clamp-1"
            >
              {{ appTitle }}
            </NuxtLink>
          </div>
        </div>
        <img
          v-else
          src="/favicon.svg"
          class="size-8 mx-auto"
        />
      </template>

      <template #default="{ collapsed }">
        <!-- 占满侧栏高度并把滚动收敛到内部：内容超高时只在导航区内部滚动，
             不会顶动下方固定 footer；去掉底部组的 mt-auto，避免可视区域较高时
             在两组导航之间出现"-大片空隙/底栏间隔过大" -->
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <UNavigationMenu
            :collapsed="collapsed"
            :items="navItems[0]"
            orientation="vertical"
          />
          <UNavigationMenu
            :collapsed="collapsed"
            :items="navItems[1]"
            orientation="vertical"
            class="shrink-0"
          />
        </div>
      </template>

      <template #footer="{ collapsed }">
        <!-- 用户信息卡片：显示头像/用户名/邮箱及管理员标识，并提供退出登录按钮。
             折叠时仅保留头像与退出图标，节省空间 -->
        <div
          v-if="collapsed"
          class="flex flex-col items-center gap-1 px-2 pb-1"
        >
          <UAvatar
            :src="user?.avatar || undefined"
            :icon="user?.avatar ? undefined : 'tabler:user'"
            :alt="user?.username || user?.email || 'User'"
            size="lg"
          />
          <UTooltip :text="$t('ui.action.logout.tooltip')">
            <UButton
              icon="tabler:logout"
              size="sm"
              color="neutral"
              variant="ghost"
              aria-label="Logout"
              @click="handleLogout"
            />
          </UTooltip>
        </div>

        <div
          v-else
          class="flex items-center gap-2 px-2 py-1.5"
        >
          <UAvatar
            :src="user?.avatar || undefined"
            :icon="user?.avatar ? undefined : 'tabler:user'"
            :alt="user?.username || user?.email || 'User'"
            size="sm"
            class="shrink-0"
          />
          <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-(--ui-text)">{{
            user?.username || 'User'
          }}</span>
          <UBadge
            v-if="user?.isAdmin"
            size="xs"
            color="info"
            variant="subtle"
            :label="$t('dashboard.userCard.admin')"
            class="shrink-0"
          />
          <UTooltip :text="$t('ui.action.logout.tooltip')">
            <UButton
              icon="tabler:logout"
              size="sm"
              color="neutral"
              variant="ghost"
              class="shrink-0"
              aria-label="Logout"
              @click="handleLogout"
            />
          </UTooltip>
        </div>
      </template>
    </UDashboardSidebar>

    <NuxtPage v-slot="{ Component }">
      <!-- 页面根节点多为 <UDashboardPanel>（内部是 fragment），<Transition> 无法为 fragment
           根节点执行进入/离开动画，mode="out-in" 时进入态会卡在 opacity:0 导致内容区黑屏。
           因此这里不做自定义过渡，由 Nuxt 原生完成路由切换，避免黑屏。 -->
      <component :is="Component" :key="route.path" />
    </NuxtPage>
  </UDashboardGroup>
</template>
