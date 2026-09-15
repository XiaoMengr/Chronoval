import * as si from 'systeminformation'

// CPU 高频监测：不走 stats 接口的 10s 缓存，供后台页每 1~2 秒轮询，实时反映负载变化
export default eventHandler(async (event) => {
  await requireUserSession(event)

  try {
    const cpu = await si.currentLoad()
    const load = Number.isFinite(cpu.currentLoad) ? cpu.currentLoad : 0
    return { current: Math.round(load * 10) / 10 }
  } catch (error) {
    console.warn('Failed to read CPU load:', error)
    return { current: 0 }
  }
})