<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

interface LogEntry {
  date: string
  args: string[]
  message: string
  messageLower: string
  type: string
  level: number
  tag: string
  tagLower: string
  raw: string
}

const logs = ref<LogEntry[]>([])
const searchQuery = ref('')
const selectedLevels = ref<string[]>([])
const selectedTags = ref<string[]>([])
const autoScroll = ref(true)
const isConnected = ref(false)
const connectionState = ref<'idle' | 'connecting' | 'loadingHistory' | 'live' | 'error'>('idle')
const logContainer = ref<HTMLElement>()
const isInitialLoading = ref(false)
const loadingProgress = ref(0)
// 搜索防抖：只在停止输入 250ms 后触发过滤/高亮，避免每敲一个字符全量重算
const debouncedSearchQuery = ref('')
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined
watch(searchQuery, (val) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    debouncedSearchQuery.value = val.trim().toLowerCase()
  }, 250)
})
const scrollTop = ref(0)
const containerHeight = ref(0)

// 批处理队列
const batchQueue = ref<LogEntry[]>([])
const isBatchProcessing = ref(false)
const MAX_LOG_LINES = 6000
const TRIM_TO_LOG_LINES = 4000
const BATCH_SIZE = 100 // 每批处理的日志条数
const BATCH_DELAY = 8 // 每批处理间隔（毫秒）
const INITIAL_LOG_LINES = 15 // 默认仅回放最近 N 行，避免一进页面就解析整文件导致卡死
const HISTORY_LOG_LINES = 2000 // 点击“查看历史记录”时最多回放的最近行数（贴合服务端上限）
const historyFullyLoaded = ref(false) // 是否已展开历史记录
const isLoadingHistory = ref(false) // 正在加载历史
const ROW_HEIGHT = 28
const VIRTUAL_OVERSCAN = 20
const VIRTUAL_BOTTOM_PADDING = 8

let resizeObserver: ResizeObserver | null = null

const logLevels = ['error', 'warn', 'info', 'success', 'debug']

// 根据级别数字获取类型名称
const getLevelType = (level: number): string => {
  const levelMap: Record<number, string> = {
    0: 'error',
    1: 'warn',
    2: 'info',
    3: 'info',
    4: 'debug',
  }
  return levelMap[level] || 'info'
}

// 级别筛选 chip 的轮廓色
const chipColor = (
  level: string,
): 'danger' | 'warning' | 'info' | 'success' | 'neutral' => {
  const map: Record<string, 'danger' | 'warning' | 'info' | 'success' | 'neutral'> = {
    error: 'danger',
    warn: 'warning',
    info: 'info',
    success: 'success',
    debug: 'neutral',
  }
  return map[level] || 'neutral'
}
const isLevelActive = (level: string) => selectedLevels.value.includes(level)
const toggleLevel = (level: string) => {
  const i = selectedLevels.value.indexOf(level)
  if (i >= 0) selectedLevels.value.splice(i, 1)
  else selectedLevels.value.push(level)
}

// EventSource 连接
let eventSource: EventSource | null = null

// 批处理添加日志
const addLogEntry = (logEntry: LogEntry) => {
  batchQueue.value.push(logEntry)
  if (!isBatchProcessing.value) {
    processBatch()
  }
}

// 处理批队列
const processBatch = async () => {
  if (isBatchProcessing.value || batchQueue.value.length === 0) return

  isBatchProcessing.value = true

  while (batchQueue.value.length > 0) {
    const batch = batchQueue.value.splice(0, BATCH_SIZE)
    logs.value.push(...batch)

    // 限制日志条数，避免内存泄漏
    if (logs.value.length > MAX_LOG_LINES) {
      logs.value = logs.value.slice(-TRIM_TO_LOG_LINES)
    }

    // 更新加载进度（只在初始加载时显示）
    if (isInitialLoading.value) {
      loadingProgress.value = Math.min(
        95,
        loadingProgress.value + batch.length * 0.05,
      )
    }

    // 还有更多批次则延迟处理以避免阻塞 UI（不在每批内 await 滚动，仅结束后统一滚一次）
    if (batchQueue.value.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
    }
  }

  isBatchProcessing.value = false

  // 批次结束后统一滚动到底部，避免初始加载时逐批滚动造成卡顿
  if (autoScroll.value) {
    void scrollToBottom()
  }

  // 注意：初始加载完成现在由消息超时检测控制，不在这里处理
}

// 解析日志行
const parseLogLine = (line: string): LogEntry | null => {
  try {
    const logData = JSON.parse(line)
    const args = Array.isArray(logData.args)
      ? logData.args.map((arg: unknown) =>
          typeof arg === 'string' ? arg : JSON.stringify(arg),
        )
      : []
    const message = args.join(' ')
    const tag = String(logData.tag || '')

    return {
      date: logData.date,
      args,
      message,
      messageLower: message.toLowerCase(),
      type: logData.type || 'info',
      level: logData.level || 3,
      tag,
      tagLower: tag.toLowerCase(),
      raw: line,
    }
  } catch {
    // 如果解析失败，创建一个fallback日志条目
    const message = line
    return {
      date: new Date().toISOString(),
      args: [line],
      message,
      messageLower: message.toLowerCase(),
      type: 'info',
      level: 3,
      tag: 'fallback',
      tagLower: 'fallback',
      raw: line,
    }
  }
}

// 过滤后的日志
const filteredLogs = computed(() => {
  const hasLevelFilter = selectedLevels.value.length > 0
  const hasTagFilter = selectedTags.value.length > 0
  const query = debouncedSearchQuery.value

  // 无任何过滤条件时直接返回原始日志，跳过全量重算
  if (!hasLevelFilter && !hasTagFilter && !query) {
    return logs.value
  }

  let filtered = logs.value

  // 按级别过滤
  if (hasLevelFilter) {
    filtered = filtered.filter((log) => {
      const logType = log.type || getLevelType(log.level)
      return selectedLevels.value.includes(logType)
    })
  }

  // 按标签过滤
  if (hasTagFilter) {
    const selected = new Set(selectedTags.value)
    filtered = filtered.filter((log) => selected.has(log.tag))
  }

  // 按搜索词过滤
  if (query) {
    filtered = filtered.filter((log) => {
      return log.messageLower.includes(query) || log.tagLower.includes(query)
    })
  }

  return filtered
})

const availableTags = computed(() => {
  const tags = new Set<string>()
  for (const log of logs.value) {
    if (log.tag) {
      tags.add(log.tag)
    }
  }

  return Array.from(tags)
    .sort((a, b) => a.localeCompare(b))
    .map((tag) => ({
      label: tag,
      value: tag,
    }))
})

const totalVirtualHeight = computed(
  () => filteredLogs.value.length * ROW_HEIGHT + VIRTUAL_BOTTOM_PADDING,
)

const virtualStart = computed(() => {
  const start = Math.floor(scrollTop.value / ROW_HEIGHT) - VIRTUAL_OVERSCAN
  return Math.max(0, start)
})

const virtualEnd = computed(() => {
  const visibleCount =
    Math.ceil(containerHeight.value / ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2
  return Math.min(
    filteredLogs.value.length,
    virtualStart.value + Math.max(visibleCount, 1),
  )
})

const virtualOffset = computed(() => virtualStart.value * ROW_HEIGHT)

const visibleLogs = computed(() => {
  return filteredLogs.value.slice(virtualStart.value, virtualEnd.value)
})

// 状态栏指示灯颜色
const statusDotClass = computed(() => {
  const color = getConnectionStatusColor()
  if (color === 'success') return 'bg-emerald-400'
  if (color === 'error') return 'bg-red-400'
  if (color === 'info') return 'bg-sky-400'
  return 'bg-amber-400'
})

// 终端行配色：error→红 warn→黄 info→青 success→绿 debug→灰
const tRowClass = (log: LogEntry) => {
  const logType = log.type || getLevelType(log.level)
  const map: Record<string, string> = {
    error: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05] text-red-600 dark:text-red-400',
    warn: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05] text-amber-600 dark:text-yellow-300',
    info: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05] text-zinc-800 dark:text-zinc-300',
    success: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05] text-emerald-600 dark:text-emerald-400',
    debug: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05] text-zinc-500',
  }
  return map[logType] || map.info
}

// 级别徽标配色
const tLevelClass = (log: LogEntry) => {
  const logType = log.type || getLevelType(log.level)
  const map: Record<string, string> = {
    error: 'bg-red-500/15 text-red-600 dark:text-red-400',
    warn: 'bg-yellow-500/15 text-amber-600 dark:text-yellow-300',
    info: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    debug: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-500',
  }
  return map[logType] || map.info
}

const getConnectionStatusColor = ():
  | 'error'
  | 'info'
  | 'success'
  | 'primary'
  | 'secondary'
  | 'warning'
  | 'neutral' => {
  if (connectionState.value === 'live') {
    return 'success'
  }
  if (connectionState.value === 'connecting' || connectionState.value === 'loadingHistory') {
    return 'info'
  }
  if (connectionState.value === 'error') {
    return 'error'
  }
  return 'warning'
}

// 高亮搜索结果
const highlightSearch = (content: string) => {
  const query = debouncedSearchQuery.value
  if (!query) return content

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
  const regex = new RegExp(`(${escaped})`, 'gi')
  return content.replace(
    regex,
    '<mark class="bg-yellow-300 dark:bg-yellow-700 text-black dark:text-white rounded">$1</mark>',
  )
}

// 切换自动滚动
const toggleAutoScroll = () => {
  autoScroll.value = !autoScroll.value
  if (autoScroll.value) {
    scrollToBottom()
  }
}

// 滚动到底部
const scrollToBottom = async () => {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}

// 处理滚动事件（rAF 节流，避免每次 scroll 都写响应式变量）
let scrollRaf: number | null = null
const handleScroll = () => {
  if (scrollRaf !== null) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null
    if (!logContainer.value) return
    const {
      scrollTop: currentScrollTop,
      scrollHeight,
      clientHeight,
    } = logContainer.value
    scrollTop.value = currentScrollTop
    containerHeight.value = clientHeight
    const isNearBottom = currentScrollTop + clientHeight >= scrollHeight - 50 // 距离底部50px以内
    const isAtTop = currentScrollTop + clientHeight < scrollHeight - 200 // 距离底部200px以上

    // 如果滚动到接近底部，自动开启自动滚动
    if (isNearBottom && !autoScroll.value) {
      autoScroll.value = true
    }
    // 如果用户手动滚动到较高位置，暂停自动滚动
    else if (isAtTop && autoScroll.value) {
      autoScroll.value = false
    }
  })
}

// 连接日志流（initialLines 决定回放多少条历史，默认最近 15 条）
const connectLogStream = (initialLines: number = INITIAL_LOG_LINES) => {
  if (eventSource) {
    eventSource.close()
  }

  // 重置状态
  logs.value = []
  batchQueue.value = []
  isInitialLoading.value = true
  loadingProgress.value = 5
  historyFullyLoaded.value = false

  connectionState.value = 'connecting'
  eventSource = new EventSource(`/api/system/logs?initial=${initialLines}`)

  let initialLoadCompleteTimer: NodeJS.Timeout | null = null
  const MESSAGE_TIMEOUT = 2000 // 消息间隔超时时间（毫秒）

  eventSource.onopen = () => {
    isConnected.value = true
    connectionState.value = 'loadingHistory'
  }

  eventSource.onmessage = (event) => {
    const logLine = event.data
    if (logLine && logLine.trim()) {
      const logEntry = parseLogLine(logLine)
      if (logEntry) {
        // 清除之前的定时器
        if (initialLoadCompleteTimer) {
          clearTimeout(initialLoadCompleteTimer)
          initialLoadCompleteTimer = null
        }

        if (isInitialLoading.value) {
          addLogEntry(logEntry)
          loadingProgress.value = Math.min(90, loadingProgress.value + 0.2)

          // 设置新的定时器，如果在指定时间内没有新消息，认为初始加载完成
          initialLoadCompleteTimer = setTimeout(() => {
            if (isInitialLoading.value) {
              connectionState.value = 'live'
              // 让加载指示器显示完成状态后再隐藏
              setTimeout(() => {
                isInitialLoading.value = false
                loadingProgress.value = 100
                autoScroll.value = true
                scrollToBottom()
              }, 500)
            }
          }, MESSAGE_TIMEOUT)
        } else {
          // 实时日志直接添加
          addLogEntry(logEntry)
        }
      }
    }
  }

  eventSource.onerror = (error) => {
    isConnected.value = false
    connectionState.value = 'error'
    console.error('EventSource error:', error)
  }
}

watch(
  [selectedLevels, selectedTags, searchQuery],
  () => {
    if (autoScroll.value) {
      scrollToBottom()
    }
  },
  { deep: true },
)

// 加载更多历史：以更大的回溯行数重新连接日志流
const loadFullHistory = () => {
  if (isLoadingHistory.value) return
  isLoadingHistory.value = true
  try {
    // 重新连接会重置列表并以最近 HISTORY_LOG_LINES 行回放
    connectLogStream(HISTORY_LOG_LINES)
    historyFullyLoaded.value = true
  } finally {
    isLoadingHistory.value = false
  }
}

onMounted(() => {
  if (logContainer.value) {
    containerHeight.value = logContainer.value.clientHeight
  }

  if (typeof ResizeObserver !== 'undefined' && logContainer.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const [entry] = entries
      if (!entry) return
      containerHeight.value = entry.contentRect.height
    })
    resizeObserver.observe(logContainer.value)
  }

  connectLogStream()
})

onUnmounted(() => {
  if (scrollRaf !== null) {
    cancelAnimationFrame(scrollRaf)
    scrollRaf = null
  }
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  if (eventSource) {
    eventSource.close()
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.logs')">
        <template #right>
          <div class="flex items-center gap-1.5">
            <span
              class="size-2 shrink-0 rounded-full"
              :class="[statusDotClass, { 'animate-pulse': connectionState === 'live' }]"
            ></span>
            <span class="hidden sm:inline text-sm text-neutral-500 dark:text-neutral-400">
              {{ $t('dashboard.logs.connectionStatus.' + connectionState) }}
            </span>
            <UButton
              icon="tabler:refresh"
              color="neutral"
              variant="ghost"
              size="sm"
              title="reload"
              :disabled="isInitialLoading"
              class="ms-1"
              @click="connectLogStream"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full flex-col flex-1 min-h-0">
        <!-- 筛选栏 -->
        <div
          class="shrink-0 border-b border-neutral-200/80 px-4 py-3 dark:border-neutral-800"
        >
          <!-- 搜索 + 自动滚动 -->
          <div class="flex items-center gap-2.5">
            <UInput
              v-model="searchQuery"
              :placeholder="$t('dashboard.logs.search.placeholder')"
              size="sm"
              icon="tabler:search"
              class="max-w-sm min-w-0 flex-1"
            >
              <template v-if="searchQuery?.length" #trailing>
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  icon="tabler:x"
                  :aria-label="$t('dashboard.logs.search.clearAriaLabel')"
                  @click="searchQuery = ''"
                />
              </template>
            </UInput>
            <UButton
              :icon="autoScroll ? 'tabler:arrow-bar-to-down' : 'tabler:arrow-bar-up'"
              color="neutral"
              size="sm"
              :variant="autoScroll ? 'soft' : 'outline'"
              title="auto scroll"
              class="shrink-0"
              @click="toggleAutoScroll"
            />
          </div>

          <!-- 级别筛选 chips + Tag 筛选 -->
          <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
            <UButton
              size="xs"
              :variant="selectedLevels.length === 0 ? 'soft' : 'outline'"
              color="neutral"
              class="uppercase"
              @click="selectedLevels = []"
            >
              {{ $t('dashboard.logs.filter.all') }}
            </UButton>
            <UButton
              v-for="lvl in logLevels"
              :key="lvl"
              size="xs"
              :color="chipColor(lvl)"
              :variant="isLevelActive(lvl) ? 'soft' : 'outline'"
              class="uppercase"
              @click="toggleLevel(lvl)"
            >{{ lvl }}</UButton>

            <div class="ms-auto max-w-[10rem] min-w-0 sm:max-w-full">
              <USelectMenu
                v-model="selectedTags"
                :items="availableTags"
                multiple
                size="sm"
                :placeholder="$t('dashboard.logs.filter.tagPlaceholder')"
                class="w-full sm:w-48"
              />
            </div>
          </div>
        </div>

        <!-- 日志主体 -->
        <div class="relative min-h-0 flex-1 font-mono text-[13px]">
          <div
            ref="logContainer"
            class="log-scroll absolute inset-0 overflow-y-auto overflow-x-hidden"
            :class="{ 'scroll-smooth': autoScroll }"
            @scroll="handleScroll"
          >
            <div :style="{ height: `${totalVirtualHeight}px`, position: 'relative' }">
              <div
                class="absolute inset-x-0 top-0"
                :style="{ transform: `translateY(${virtualOffset}px)` }"
              >
                <div
                  v-for="(log, index) in visibleLogs"
                  :key="`${virtualStart + index}-${log.raw}`"
                  class="log-row flex items-center gap-3 border-b border-neutral-100/80 px-4 dark:border-neutral-800/60"
                  :class="tRowClass(log)"
                  :style="{ height: `${ROW_HEIGHT}px` }"
                >
                  <span class="log-time shrink-0 whitespace-nowrap text-xs tabular-nums">
                    {{ $dayjs(log.date).tz('Asia/Shanghai').format('HH:mm:ss.SSS') }}
                  </span>
                  <span
                    class="shrink-0 rounded px-1.5 py-px text-[10px] font-semibold tracking-wide"
                    :class="tLevelClass(log)"
                  >
                    {{ (log.type || getLevelType(log.level)).toUpperCase().slice(0, 4) }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <span
                      v-if="debouncedSearchQuery"
                      class="block overflow-hidden text-ellipsis whitespace-nowrap"
                      v-html="highlightSearch(log.message)"
                    ></span>
                    <span
                      v-else
                      class="block overflow-hidden text-ellipsis whitespace-nowrap"
                    >{{ log.message }}</span>
                  </div>
                  <span
                    v-if="log.tag"
                    class="log-tag hidden max-w-40 shrink-0 truncate whitespace-nowrap text-[11px] md:inline"
                  >{{ log.tag }}</span>
                </div>
              </div>
            </div>
            <div
              v-if="filteredLogs.length === 0"
              class="absolute inset-0 flex items-center justify-center text-neutral-400 dark:text-neutral-500"
            >
              <div v-if="logs.length === 0">{{ $t('dashboard.logs.empty.waiting') }}</div>
              <div v-else>{{ $t('dashboard.logs.empty.noMatch') }}</div>
            </div>
          </div>

          <!-- 仅显示最近 N 条时的历史提示条 -->
          <transition
            enter-active-class="transition-all duration-200"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
          >
            <div
              v-if="!historyFullyLoaded && !isInitialLoading"
              class="absolute left-1/2 top-3 z-20 flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-full border border-neutral-200/80 bg-white/80 px-3 py-1.5 shadow-md backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80"
            >
              <UIcon
                name="tabler:history"
                class="size-3.5 shrink-0 text-neutral-400"
              />
              <span class="truncate whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                {{ $t('dashboard.logs.historyHint', { count: INITIAL_LOG_LINES }) }}
              </span>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="tabler:dots-vertical"
                class="shrink-0"
                :loading="isLoadingHistory"
                @click="loadFullHistory"
              >
                {{ $t('dashboard.logs.loadHistory') }}
              </UButton>
            </div>
          </transition>

          <!-- 初始加载遮罩 -->
          <div
            v-if="isInitialLoading"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-50/80 backdrop-blur-sm dark:bg-neutral-950/70"
          >
            <UIcon
              name="tabler:loader-2"
              class="h-7 w-7 animate-spin text-sky-500"
            />
            <div class="text-xs text-neutral-400 dark:text-neutral-500">
              {{ $t('dashboard.logs.connectionStatus.loadingHistory') }}
            </div>
            <div class="h-1 w-56 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                class="h-full rounded-full bg-sky-400 transition-all duration-300 ease-out"
                :style="{ width: `${loadingProgress}%` }"
              ></div>
            </div>
          </div>
        </div>

        <!-- 状态栏 -->
        <div
          class="flex h-8 shrink-0 items-center gap-3 border-t border-neutral-200/80 px-4 text-[11px] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500"
        >
          <UIcon name="tabler:terminal-2" class="size-3.5 shrink-0" />
          <span class="truncate">
            {{ $t('dashboard.logs.connectionStatus.' + connectionState) }}
          </span>
          <span class="ms-auto tabular-nums">
            {{ $t('dashboard.logs.countLabel', { total: logs.length, shown: filteredLogs.length }) }}
          </span>
          <span v-if="availableTags.length" class="hidden tabular-nums sm:inline">
            {{ $t('dashboard.logs.tagCount', { count: availableTags.length }) }}
          </span>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* 日志视图：随全局浅色/深色主题显示，保持清爽克制的观感 */
.log-time {
  color: var(--ui-text-muted);
}

.log-tag {
  color: var(--ui-text-muted);
}

/* 滚动条 */
.log-scroll::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.log-scroll::-webkit-scrollbar-thumb {
  background: var(--ui-text-dimmed);
  border-radius: 4px;
  opacity: 0.6;
}
.log-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--ui-text-muted);
}
.log-scroll::-webkit-scrollbar-track {
  background: transparent;
}

/* 搜索高亮 */
.log-scroll :deep(mark) {
  background: #f4bf3f;
  color: #0c0c10;
  border-radius: 2px;
  padding: 0 2px;
}
</style>
