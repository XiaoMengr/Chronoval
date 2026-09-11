import pkg from './package.json'
import type { AnalyticsConfig } from './shared/types/config'
import i18n, { dayjsLocales } from './i18n/i18n.options'

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

  // 允许通过 dev.1xc.top 访问（frp 穿透 + caddy 反代的 Host）
  server: {
    allowedHosts: ['dev.1xc.top', '.1xc.top'],
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
      allowedHosts: ['dev.1xc.top', '.1xc.top', 'localhost'],
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

  icon: {
    clientBundle: {
      scan: true,
    },
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
