/**
 * 数字滚动动画：把给定数值从 0 平滑过渡到目标值（首次进入），
 * 后续数值变化时从当前值渐变为新目标值，不重新归零。
 *
 * 用法：传入一个返回目标数值的响应式子过程（getter），返回一个取整后的响应式显示值。
 *   const animPct = useAnimatedNumber(() => mediaTypePercent('image'))
 *   // 模板：{{ animPct.value }}
 */
export function useAnimatedNumber(source: () => number, duration = 1000) {
  const displayed = ref(0)
  let raf = 0

  const animate = (from: number, to: number) => {
    if (raf) cancelAnimationFrame(raf)
    if (Math.abs(to - from) < 0.0001) {
      displayed.value = to
      return
    }
    const delta = to - from
    const startTime = performance.now()
    const step = (now: number) => {
      const p = Math.min((now - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3) // easeOutCubic
      displayed.value = from + delta * ease
      if (p < 1) raf = requestAnimationFrame(step)
      else raf = 0
    }
    raf = requestAnimationFrame(step)
  }

  const latest = computed(source)

  onMounted(() => {
    animate(0, latest.value)
  })
  watch(latest, (to) => {
    animate(displayed.value, to)
  })
  onBeforeUnmount(() => cancelAnimationFrame(raf))

  return { value: computed(() => Math.round(displayed.value)) }
}