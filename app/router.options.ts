import type { RouterConfig } from 'nuxt/schema'

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    if (from.path === '/' || to.name === 'slug') {
      return false
    }

    return { top: 0 }
  },
}
