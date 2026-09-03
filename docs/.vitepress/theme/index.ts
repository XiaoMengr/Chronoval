import type { App } from 'vue'
import DefaultTheme from 'vitepress/theme'
import AdsenseToc from './components/AdsenseToc.vue'
import Layout from './Layout.vue'

export default {
  ...DefaultTheme,
  enhanceApp({ app }: { app: App }) {
    app.component('AdsenseToc', AdsenseToc)
  },
  Layout,
}
