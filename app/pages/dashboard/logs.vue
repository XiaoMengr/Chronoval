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
const INITIAL_LOG_LINES = 1000 // 仅回放最近 N 行历史，避免整文件逐行回放导致的缓慢
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
    error: 'hover:bg-white/[0.05] text-red-400',
    warn: 'hover:bg-white/[0.05] text-yellow-300',
    info: 'hover:bg-white/[0.05] text-zinc-300',
    success: 'hover:bg-white/[0.05] text-emerald-400',
    debug: 'hover:bg-white/[0.05] text-zinc-500',
  }
  return map[logType] || map.info
}

// 级别徽标配色
const tLevelClass = (log: LogEntry) => {
  const logType = log.type || getLevelType(log.level)
  const map: Record<string, string> = {
    error: 'bg-red-500/15 text-red-400',
    warn: 'bg-yellow-500/15 text-yellow-300',
    info: 'bg-sky-500/15 text-sky-400',
    success: 'bg-emerald-500/15 text-emerald-400',
    debug: 'bg-zinc-500/15 text-zinc-500',
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

// 连接日志流
const connectLogStream = () => {
  if (eventSource) {
    eventSource.close()
  }

  // 重置状态
  logs.value = []
  batchQueue.value = []
  isInitialLoading.value = true
  loadingProgress.value = 5

  connectionState.value = 'connecting'
  eventSource = new EventSource(`/api/system/logs?initial=${INITIAL_LOG_LINES}`)

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
      <UDashboardNavbar :title="$t('title.logs')" />
    </template>

    <template #body>
      <div class="terminal-shell flex flex-col flex-1 min-h-0">
        <!-- 标题栏：macOS 红绿灯 + 居中标题 -->
        <div class="terminal-titlebar flex items-center gap-3 h-11 shrink-0 select-none">
          <div class="flex items-center gap-2">
            <span class="t-dot bg-[#ff5f57]"></span>
            <span class="t-dot bg-[#febc2e]"></span>
            <span class="t-dot bg-[#28c840]"></span>
          </div>
          <div class="flex-1 min-w-0 flex items-center justify-center gap-2 text-xs text-zinc-400 truncate">
            <UIcon
              name="tabler:terminal-2"
              class="size-3.5 shrink-0"
            />
            <span class="truncate font-medium">app.log</span>
            <span class="text-zinc-600">–</span>
            <span class="text-zinc-500 truncate">~/chronoval/data/logs</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <UBadge
              v-if="connectionState !== 'idle'"
              size="sm"
              variant="solid"
              :color="getConnectionStatusColor()"
            >
              {{ $t('dashboard.logs.connectionStatus.' + connectionState) }}
            </UBadge>
            <UButton
              icon="tabler:refresh"
              color="neutral"
              variant="ghost"
              size="sm"
              title="reload"
              :disabled="isInitialLoading"
              @click="connectLogStream"
            />
          </div>
        </div>

        <!-- 工具栏 -->
        <div
          class="terminal-toolbar flex flex-wrap items-center gap-2 px-3 py-2 border-t border-white/[0.06] shrink-0"
        >
          <UInput
            v-model="searchQuery"
            :placeholder="$t('dashboard.logs.search.placeholder')"
            size="sm"
            icon="tabler:search"
            class="w-full sm:w-56 md:w-72"
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
          <USelect
            v-model="selectedLevels"
            :items="logLevels.map((l) => ({ label: l.toUpperCase(), value: l }))"
            multiple
            size="sm"
            :placeholder="$t('dashboard.logs.filter.levelPlaceholder')"
            class="w-32"
            :clearable="false"
          />
          <USelect
            v-model="selectedTags"
            :items="availableTags"
            multiple
            size="sm"
            :placeholder="$t('dashboard.logs.filter.tagPlaceholder')"
            class="w-40 sm:w-52"
            :clearable="false"
          />
          <UButton
            :icon="autoScroll ? 'tabler:arrow-bar-to-down' : 'tabler:arrow-bar-up'"
            color="neutral"
            size="sm"
            :variant="autoScroll ? 'soft' : 'outline'"
            title="auto scroll"
            class="ms-auto"
            @click="toggleAutoScroll"
          />
        </div>

        <!-- 日志主体 -->
        <div
          class="terminal-body flex-1 min-h-0 relative font-mono text-[13px]"
        >
          <div
            ref="logContainer"
            class="t-scroll absolute inset-0 overflow-y-auto overflow-x-hidden"
            :class="{ 'scroll-smooth': autoScroll }"
            @scroll="handleScroll"
          >
            <div :style="{ height: `${totalVirtualHeight}px`, position: 'relative' }">
              <div
                class="absolute left-0 right-0 top-0"
                :style="{ transform: `translateY(${virtualOffset}px)` }"
              >
                <div
                  v-for="(log, index) in visibleLogs"
                  :key="`${virtualStart + index}-${log.raw}`"
                  class="t-row flex items-center gap-3 px-3 border-b border-white/[0.03]"
                  :class="tRowClass(log)"
                  :style="{ height: `${ROW_HEIGHT}px` }"
                >
                  <span class="t-time whitespace-nowrap shrink-0 text-xs">
                    {{ $dayjs(log.date).format('HH:mm:ss.SSS') }}
                  </span>
                  <span
                    class="t-level shrink-0 text-[10px] font-semibold tracking-wide rounded px-1.5 py-px"
                    :class="tLevelClass(log)"
                  >
                    {{ (log.type || getLevelType(log.level)).toUpperCase().slice(0, 4) }}
                  </span>
                  <div class="flex-1 min-w-0">
                    <span
                      v-if="debouncedSearchQuery"
                      class="block whitespace-nowrap overflow-hidden text-ellipsis"
                      v-html="highlightSearch(log.message)"
                    ></span>
                    <span
                      v-else
                      class="block whitespace-nowrap overflow-hidden text-ellipsis"
                    >{{ log.message }}</span>
                  </div>
                  <span
                    v-if="log.tag"
                    class="t-tag text-[11px] whitespace-nowrap shrink-0 truncate"
                  >{{ log.tag }}</span>
                </div>
              </div>

            </div>
            <div
              v-if="filteredLogs.length === 0"
              class="absolute inset-0 flex items-center justify-center text-zinc-600"
            >
              <div v-if="logs.length === 0">{{ $t('dashboard.logs.empty.waiting') }}</div>
              <div v-else>{{ $t('dashboard.logs.empty.noMatch') }}</div>
            </div>
          </div>

          <!-- 初始加载遮罩 -->
          <div
            v-if="isInitialLoading"
            class="absolute inset-0 bg-[#0c0c10]/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10"
          >
            <UIcon
              name="tabler:loader-2"
              class="animate-spin w-7 h-7 text-emerald-400"
            />
            <div class="text-xs text-zinc-400">
              {{ $t('dashboard.logs.connectionStatus.loadingHistory') }}
            </div>
            <div class="w-56 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                class="h-full bg-emerald-400 rounded-full transition-all duration-300 ease-out"
                :style="{ width: `${loadingProgress}%` }"
              ></div>
            </div>
          </div>
        </div>

        <!-- 状态栏 -->
        <div
          class="terminal-statusbar flex items-center gap-3 px-3 h-7 text-[11px] text-zinc-500 border-t border-white/[0.06] shrink-0"
        >
          <span class="t-dot size-1.5" :class="statusDotClass"></span>
          <span>{{ $t('dashboard.logs.connectionStatus.' + connectionState) }}</span>
          <span class="ms-auto tabular-nums">
            {{ $t('dashboard.logs.countLabel', { total: logs.length, shown: filteredLogs.length }) }}
          </span>
          <span v-if="availableTags.length" class="hidden sm:inline tabular-nums">
            {{ $t('dashboard.logs.tagCount', { count: availableTags.length }) }}
          </span>
          <span class="t-cursor"></span>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.terminal-shell {
  background: #0c0c10;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: #d4d4d4;
  overflow: hidden;
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.6);
}

.terminal-titlebar {
  background: linear-gradient(#1b1b20, #141419);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.terminal-toolbar {
  background: #141419;
}

.terminal-statusbar {
  background: #141419;
}

.t-dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 9999px;
}

.terminal-toolbar :deep(input) {
  background-color: #0c0c10 !important;
  color: #d4d4d4 !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
}
.terminal-toolbar :deep(input::placeholder) {
  color: #565f89 !important;
}
.terminal-toolbar :deep(button) {
  background-color: #141419;
}
.terminal-toolbar :deep([data-slot='trigger']) {
  background-color: #0c0c10 !important;
  color: #d4d4d4 !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
}

/* 行内配色 */
.t-time {
  color: #565f89;
}
.t-tag {
  color: #565f89;
}

/* 滚动条 */
.t-scroll::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.t-scroll::-webkit-scrollbar-thumb {
  background: #2a2a31;
  border-radius: 4px;
}
.t-scroll::-webkit-scrollbar-thumb:hover {
  background: #3a3a44;
}
.t-scroll::-webkit-scrollbar-track {
  background: transparent;
}

/* 高亮 */
:deep(mark) {
  background: #f4bf3f;
  color: #0c0c10;
  border-radius: 2px;
  padding: 0 2px;
}

/* 闪烁光标 */
.t-cursor {
  display: inline-block;
  width: 7px;
  height: 14px;
  background: #f4bf3f;
  animation: t-blink 1.1s steps(2, start) infinite;
}
@keyframes t-blink {
  50% {
    opacity: 0;
  }
}
</style>
