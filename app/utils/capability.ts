// 浏览器能力检测工具

/**
 * 是否支持「3D 轮盘」所需的 3D 变换能力（transform-style: preserve-3d）。
 * 轮盘动画依赖 preserve-3d 才能在空间立放卡片；部分老浏览器/低端内核会把
 * preserve-3d 退化成 flat，导致轮盘错位。这里通过运行时特性检测判断。
 *
 * @returns true=支持 3D 轮盘；false=应回退到「默认」模式（直接随机打开）。
 */
export function supportsWheel3D(): boolean {
  if (typeof document === 'undefined') return true // SSR / 无 DOM 环境按支持处理
  try {
    const probe = document.createElement('div')
    probe.style.transformStyle = 'preserve-3d'
    document.body.appendChild(probe)
    const style = window.getComputedStyle(probe).transformStyle
    document.body.removeChild(probe)
    return style === 'preserve-3d'
  } catch {
    // 异常时保守按支持处理，避免干扰正常流程
    return true
  }
}