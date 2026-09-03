import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'ChronoFrame',
  description: '自部署、在线管理的个人画廊',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '指南', link: '/zh/guide/getting-started' },
      { text: '开发文档', link: '/zh/development/contributing' },
      { text: '演示', link: 'https://lens.bh8.ga' },
    ],

    sidebar: [
      {
        text: '指南',
        items: [
          { text: '快速开始', link: '/zh/guide/getting-started' },
          { text: '配置说明', link: '/zh/guide/configuration' },
          { text: '升级指南', link: '/zh/guide/updates' },
        ],
      },
      {
        text: '配置',
        items: [
          { text: '存储提供器', link: '/zh/configuration/storage-providers' },
          { text: '地图提供器', link: '/zh/configuration/map-providers' },
          { text: '位置提供器', link: '/zh/configuration/location-providers' },
        ],
      },
      {
        text: '开发',
        items: [
          { text: '贡献指南', link: '/zh/development/contributing' },
          { text: 'API 文档', link: '/zh/development/api' },
        ],
      },
    ],

    editLink: {
      text: '在 GitHub 上编辑此页面',
    },
  },
})
