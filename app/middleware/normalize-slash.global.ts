// 规范化尾斜杠：URL 一律收紧到无尾斜杠的规范路径（/login/ → /login）
//
// Nuxt 默认将 /login 与 /login/ 匹配到同一路由，但不会主动“抹平”尾斜杠。
// 一旦用户经书签 / 历史记录 / 手动输入带尾斜杠的地址（如 /login/），
// 地址栏就会一直停留在 /login/（服务端对两者都返回 200 且不做重定向）。
// 此全局中间件统一用 308 将带尾斜杠的路径重定向到对应的无尾斜杠路径，
// 保证 /login、/dashboard、/albums 等任何路由在浏览器里都只显示规范形式。
export default defineNuxtRouteMiddleware((to) => {
  const { path, fullPath } = to

  // 仅处理长度 > 1 且以 `/` 结尾的路径，根路径 `/` 不受影响。
  if (path.length > 1 && path.endsWith('/')) {
    // 去掉尾斜杠，并保留查询串与 hash：/login/?a=1#x → /login?a=1#x
    const target = path.slice(0, -1) + fullPath.slice(path.length)
    return navigateTo(target, { redirectCode: 308, replace: true })
  }
})