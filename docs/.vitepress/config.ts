import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'ChronoFrame',
  description: 'A Self-hosted photo gallery',
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    [
      'script',
      {
        async: '',
        src: 'https://www.googletagmanager.com/gtag/js?id=G-RQSZM9PP5F',
      },
    ],
    [
      'script',
      {},
      `window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-RQSZM9PP5F');`,
    ],
    [
      'script',
      {
        async: '',
        src: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7236608137732943',
        crossorigin: 'anonymous',
      },
    ],
  ],
  lastUpdated: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Development', link: '/development/contributing' },
      { text: 'Demo', link: 'https://lens.bh8.ga' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Update Guide', link: '/guide/updates' },
        ],
      },
      {
        text: 'Configuration',
        items: [
          {
            text: 'Storage Providers',
            link: '/configuration/storage-providers',
          },
          { text: 'Map Providers', link: '/configuration/map-providers' },
          {
            text: 'Location Providers',
            link: '/configuration/location-providers',
          },
        ],
      },
      {
        text: 'Development',
        items: [
          { text: 'Contributing Guide', link: '/development/contributing' },
          { text: 'API Documentation', link: '/development/api' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/HoshinoSuzumi/chronoframe' },
      { icon: 'discord', link: 'https://discord.gg/MM4ZK4Ed7s' },
    ],

    editLink: {
      pattern:
        'https://github.com/HoshinoSuzumi/chronoframe/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 Timothy Yin',
    },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en',
    },
    zh: {
      label: '简体中文',
      lang: 'zh',
      link: '/zh/',
    },
  },

  ignoreDeadLinks: [/^http?:\/\/localhost/],
})
