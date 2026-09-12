// 游客守卫：已登录用户不应看到登录页。
// 命中 /login（及 /signin 重定向）时，若已登录则直接进入主界面，避免“登入后还能再登一次”的重复登录体验。
export default defineNuxtRouteMiddleware((_to) => {
  const { loggedIn } = useUserSession()
  if (loggedIn.value) {
    return navigateTo('/')
  }
})