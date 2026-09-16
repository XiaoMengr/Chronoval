import pkg from './package.json'
import type { AnalyticsConfig } from './shared/types/config'
import i18n, { dayjsLocales } from './i18n/i18n.options'

/**
 * 解析环境变量 NUXT_ALLOWED_HOSTS：逗号分隔的主机白名单（可含通配符 *.domain）。
 * 支持特殊值 `*`，或设置 NUXT_ALLOW_ALL_HOSTS=true 以允许任意来源
 * （内网/多域名/反代/CDN 场景常用，访问控制交给反代处理）。
 */
function resolveAllowedHosts(defaults: string[]): {
  hosts: string[]
  allowAll: boolean
} {
  const fromEnv =
    process.env.NUXT_ALLOWED_HOSTS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) || []
  const allowAll =
    fromEnv.includes('*') || process.env.NUXT_ALLOW_ALL_HOSTS === 'true'
  if (allowAll) {
    return { hosts: ['*'], allowAll: true }
  }
  const merged = [...defaults]
  for (const host of fromEnv) {
    if (!merged.includes(host)) merged.push(host)
  }
  return { hosts: merged, allowAll: false }
}

// 站点规范地址：NUXT_PUBLIC_SITE_URL 优先，其次从 NUXT_PUBLIC_SITE_URL/固定值。
// 用于 OG 分享图/分享链接以及派生允许主机白名单。
const SITE_URL = process.env.NUXT_PUBLIC_SITE_URL || ''
const SITE_HOST = (() => {
  if (!SITE_URL) return ''
  try {
    return new URL(SITE_URL).hostname
  } catch {
    return SITE_URL
  }
})()

// 默认放行的主机（保留原 frp + caddy 反代场景），叠加站点地址与 env 配置。
const DEFAULT_ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '[::1]',
  'dev.1xc.top',
  '.1xc.top',
  ...(SITE_HOST ? [SITE_HOST] : []),
] as const
const ALLOWED_HOSTS = resolveAllowedHosts([...DEFAULT_ALLOWED_HOSTS])

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    'reka-ui/nuxt',
    '@nuxt/ui',
    '@nuxt/icon',
    '@nuxt/test-utils',
    '@pinia/nuxt',
    'motion-v/nuxt',
    'nuxt-auth-utils',
    '@vueuse/nuxt',
    'dayjs-nuxt',
    '@nuxtjs/i18n',
    'nuxt-mapbox',
    'nuxt-maplibre',
    'nuxt-og-image',
    'nuxt-gtag',
  ],

  css: [
    '~/assets/css/tailwind.css',
    '~/assets/css/dashboard-theme.css',
  ],

  // Host 白名单控制策略：
  // - transport 层对 Host 全部放行（内网/IP/多域名/反代场景不再被 403 拦截）；
  // - 真正的白名单校验交给运行时中间件 server/middleware/host-guard.ts，
  //   它优先读取基础设置 app.allowedHosts（保存即生效，无需重启），
  //   再回退到环境变量 NUXT_ALLOWED_HOSTS / NUXT_ALLOW_ALL_HOSTS。
  server: {
    allowedHosts: true,
  },

  components: [{ path: '~/components/ui', pathPrefix: false }, '~/components'],

  ogImage: {
    defaults: {
      width: 1200,
      height: 628,
    },
  },

  runtimeConfig: {
    public: {
      VERSION: pkg.version,
      // 站点规范地址与允许主机白名单：从设置（DB）读取后在 server 插件中覆盖，客户端用于分享/OG 地址
      siteUrl: '',
      allowedHosts: '',
      mapbox: {
        accessToken: '',
      },
      app: {
        title: 'Chronoval',
        slogan: '',
        author: '',
        avatarUrl: '',
      },
      map: {
        provider: 'maplibre' as 'mapbox' | 'maplibre',
        mapbox: {
          style: '',
        },
        maplibre: {
          token: '',
          style: '',
        },
      },
      analytics: {
        matomo: {
          enabled: false,
          url: '',
          siteId: '',
        },
      } satisfies AnalyticsConfig,
      oauth: {
        github: {
          enabled: false,
        },
      },
    },
    mapbox: {
      accessToken: '',
    },
    nominatim: {
      baseUrl: 'https://nominatim.openstreetmap.org',
    },
    STORAGE_PROVIDER: 's3' satisfies 's3' | 'local' | 'openlist',
    provider: {
      s3: {
        endpoint: '',
        bucket: '',
        region: 'auto',
        accessKeyId: '',
        secretAccessKey: '',
        prefix: '',
        cdnUrl: '',
        forcePathStyle: false,
      },
      local: {
        localPath: '/app/photos',
        baseUrl: '/storage',
        prefix: 'photos/',
      },
      openlist: {
        baseUrl: '',
        rootPath: '',
        token: '',
        endpoints: {
          upload: '/api/fs/put',
          download: '',
          list: '',
          delete: '/api/fs/remove',
          meta: '/api/fs/get',
        },
        pathField: 'path',
        cdnUrl: '',
      } as {
        baseUrl: string
        rootPath: string
        token: string
        endpoints: {
          upload: string
          download: string
          list: string
          delete: string
          meta: string
        }
        pathField: string
        cdnUrl: string
      },
    },
    library: {
      photosPath: process.env.LIBRARY_PHOTOS_PATH || '/app/photos',
      videosPath: process.env.LIBRARY_VIDEOS_PATH || '/app/videos',
      thumbnailDir: process.env.LIBRARY_THUMBNAIL_DIR || 'library/thumbnails',
      enabled: process.env.LIBRARY_ENABLED !== 'false',
    },
    upload: {
      mime: {
        whitelistEnabled: true,
        whitelist:
          'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/heic,image/heif,video/quicktime,video/mp4',
      },
      duplicateCheck: {
        enabled: true,
        mode: 'skip' as 'warn' | 'block' | 'skip',
      },
    },
    /** @deprecated Defaults to allow insecure cookies now */
    allowInsecureCookie: false,
  },

  nitro: {
    preset: 'node_server',
    experimental: {
      websocket: true,
      tasks: true,
    },
    // 沙箱内存受限，关闭 Nitro 打包阶段压缩，降低构建峰值内存
    minify: false,
  },

  vite: {
    server: {
      host: true,
      allowedHosts: ALLOWED_HOSTS.allowAll ? true : ALLOWED_HOSTS.hosts,
    },
    optimizeDeps: {
      include: [
        'zod',
        'dayjs',
        'dayjs/plugin/updateLocale',
        'dayjs/locale/zh-cn',
        'dayjs/locale/zh-hk',
        'dayjs/locale/zh-tw',
        'dayjs/locale/en',
        'dayjs/plugin/relativeTime',
        'dayjs/plugin/utc',
        'dayjs/plugin/timezone',
        'dayjs/plugin/duration',
        'dayjs/plugin/localizedFormat',
        'dayjs/plugin/isBetween',
        '@yeger/vue-masonry-wall',
        'motion-v',
        'swiper/vue',
        'swiper/modules',
        'tailwind-merge',
        'thumbhash',
        'mapbox-gl',
        'maplibre-gl',
        '@indoorequal/vue-maplibre-gl',
        'file-type',
        'reka-ui',
        'es-toolkit',
        'tippy.js',
      ],
    },
    ssr: {
      noExternal: ['@indoorequal/vue-maplibre-gl'],
    },
    css: {
      devSourcemap: false,
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return
            }

            if (
              id.includes('/mapbox-gl/') ||
              id.includes('/maplibre-gl/') ||
              id.includes('/@indoorequal/vue-maplibre-gl/') ||
              id.includes('/nuxt-mapbox/') ||
              id.includes('/nuxt-maplibre/')
            ) {
              return 'vendor-map'
            }
          },
        },
      },
      commonjsOptions: {
        include: [/maplibre-gl/, /node_modules/],
        transformMixedEsModules: true,
      },
    },
    plugins: [
      {
        apply: 'build',
        name: 'vite-plugin-ignore-sourcemap-warnings',
        configResolved(config) {
          const originalOnWarn = config.build.rollupOptions.onwarn
          config.build.rollupOptions.onwarn = (warning, warn) => {
            if (
              warning.code === 'SOURCEMAP_BROKEN' &&
              warning.plugin === '@tailwindcss/vite:generate:build'
            ) {
              return
            }

            if (originalOnWarn) {
              originalOnWarn(warning, warn)
            } else {
              warn(warning)
            }
          }
        },
      },
    ],
  },

  gtag: {
    enabled: process.env.NODE_ENV === 'production',
  },

  colorMode: {
    preference: process.env.NUXT_PUBLIC_COLOR_MODE_PREFERENCE || 'dark',
    storageKey: 'cframe-color-mode',
  },

  // ===== 字体全离线化 =====
  // @nuxt/fonts 默认的 google/bunny/fontshare/adobe 等 provider 会在运行时
  // 从 fonts.google.com / CDN 拉取字体与字体元数据（无法联网的离线/IP 部署会报
  // "Could not fetch from https://fonts.google.com/..." 并导致首次访问卡顿）。
  // 这里统一禁用远程 provider，只保留本地解析（@fontsource 本地包 + 系统字体栈）。
  fonts: {
    providers: {
      google: false,
      // Google Material 图标字体的内建 provider（unifont `googleicons`），
      // 会在启动时强制请求 fonts.google.com/metadata/icons?key=material_symbols，
      // 必须一并禁用才能完全离线。
      googleicons: false,
      bunny: false,
      fontshare: false,
      adobe: false,
      npm: false,
      // 未本地安装的字体（如 albums/index.vue 里的 Pacifico）会走 fontsource provider
      // 去 api.fontsource.org 联网拉取，受限网络下会 connect 超时重试；一并禁用。
      fontsource: false,
    },
    // fontless/fontaine 会对每个被用到的字体族联网拉取字体文件计算 fallback 度量
    // （undici fetch fromUrl），在无外网/受限网络环境下会抛 fetch failed 并使
    // 引用了 Google 字体族的页面渲染 500。这里把各类 generic 的 fallback 置空，
    // 使 generateFontFallbacks 直接返回空结果、完全杜绝联网拉取。
    defaults: {
      fallbacks: {
        serif: [],
        'sans-serif': [],
        monospace: [],
        cursive: [],
        fantasy: [],
        'system-ui': [],
        'ui-serif': [],
        'ui-sans-serif': [],
        'ui-monospace': [],
        'ui-rounded': [],
        emoji: [],
        math: [],
        fangsong: [],
      },
    },
  },

  icon: {
    clientBundle: {
      scan: true,
    },
    // 只使用本地已安装的 iconify 集合（@iconify-json/*），绝不回退到 Iconify API 联网拉取
    fallbackToApi: false,
  },

  dayjs: {
    locales: dayjsLocales,
    plugins: [
      'relativeTime',
      'utc',
      'timezone',
      'duration',
      'localizedFormat',
      'isBetween',
    ],
    defaultTimezone: 'Asia/Shanghai',
  },

  i18n,
})
