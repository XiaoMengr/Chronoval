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
const normalizedSearchQuery = computed(() =>
  searchQuery.value.trim().toLowerCase(),
)
const scrollTop = ref(0)
const containerHeight = ref(0)

// 批处理队列
const batchQueue = ref<LogEntry[]>([])
const isBatchProcessing = ref(false)
const MAX_LOG_LINES = 6000
const TRIM_TO_LOG_LINES = 4000
const BATCH_SIZE = 100 // 每批处理的日志条数
const BATCH_DELAY = 8 // 每批处理间隔（毫秒）
const INITIAL_LOG_LINES = 'all'
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

    // 自动滚动到底部
    if (autoScroll.value) {
      await scrollToBottom()
    }

    // 如果还有更多批次，延迟处理以避免阻塞UI
    if (batchQueue.value.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
    }
  }

  isBatchProcessing.value = false

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
  let filtered = logs.value

  // 按级别过滤
  if (selectedLevels.value.length > 0) {
    filtered = filtered.filter((log) => {
      const logType = log.type || getLevelType(log.level)
      return selectedLevels.value.includes(logType)
    })
  }

  // 按标签过滤
  if (selectedTags.value.length > 0) {
    const selected = new Set(selectedTags.value)
    filtered = filtered.filter((log) => selected.has(log.tag))
  }

  // 按搜索词过滤
  if (normalizedSearchQuery.value) {
    const query = normalizedSearchQuery.value
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

// 映射日志级别到 UBadge 颜色
const getBadgeColor = (
  level: string,
):
  | 'error'
  | 'info'
  | 'success'
  | 'primary'
  | 'secondary'
  | 'warning'
  | 'neutral' => {
  const colorMap: Record<
    string,
    | 'error'
    | 'info'
    | 'success'
    | 'primary'
    | 'secondary'
    | 'warning'
    | 'neutral'
  > = {
    error: 'error',
    warn: 'warning',
    info: 'info',
    success: 'success',
    debug: 'neutral',
  }
  return colorMap[level] || 'info'
}

// 获取日志行样式
const getLogLineStyle = (log: LogEntry) => {
  const baseStyle = 'hover:bg-neutral-200 dark:hover:bg-neutral-800'
  const logType = log.type || getLevelType(log.level)
  const levelStyles = {
    error: 'text-red-500 dark:text-red-400 border-l-2 border-red-500 font-bold',
    warn: 'text-yellow-500 dark:text-yellow-400 border-l-2 border-yellow-500 font-bold',
    info: 'text-neutral-400 dark:text-neutral-300 border-l-2 border-blue-500',
    success: 'text-green-500 dark:text-green-400 border-l-2 border-green-500',
    debug:
      'text-neutral-300 dark:text-neutral-400 border-l-2 border-neutral-500',
  }
  return `${baseStyle} ${levelStyles[logType as keyof typeof levelStyles] || levelStyles.info} border-none`
}

// 获取连接状态样式
const getConnectionStatusClass = () => {
  if (connectionState.value === 'live') {
    return 'text-success'
  } else if (connectionState.value === 'connecting' || connectionState.value === 'loadingHistory') {
    return 'text-info'
  } else if (connectionState.value === 'error') {
    return 'text-error'
  }
  return 'text-warning'
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
  if (!normalizedSearchQuery.value) return content

  const query = normalizedSearchQuery.value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  ) // 转义特殊字符
  const regex = new RegExp(`(${query})`, 'gi')
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

// 处理滚动事件
const handleScroll = () => {
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
      <div
        class="flex flex-col flex-1 overflow-hidden bg-neutral-100 dark:bg-neutral-950 rounded-md relative"
      >
        <div
          class="px-4 py-3 border-b border-neutral-300/80 dark:border-neutral-900 bg-linear-to-r from-neutral-50 to-neutral-100/60 dark:from-neutral-900 dark:to-neutral-950/80"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <UIcon
                  name="tabler:file-text"
                  class="w-4 h-4 text-blue-500"
                />
                <h2
                  class="text-sm sm:text-base font-semibold text-blue-600 tracking-wide"
                >
                  app.log
                </h2>
                <UBadge
                  v-if="connectionState !== 'idle'"
                  size="sm"
                  variant="soft"
                  :color="getConnectionStatusColor()"
                >
                  {{ $t('dashboard.logs.connectionStatus.' + connectionState) }}
                </UBadge>
              </div>
              <div
                class="mt-1 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400"
              >
                <span>{{ $t('dashboard.logs.countLabel', { total: logs.length, shown: filteredLogs.length }) }}</span>
                <span v-if="availableTags.length">{{ $t('dashboard.logs.tagCount', { count: availableTags.length }) }}</span>
              </div>
            </div>
            <span
              v-if="connectionState !== 'idle'"
              :class="[
                'text-xs font-medium hidden sm:inline',
                getConnectionStatusClass(),
              ]"
            >
              {{ $t('dashboard.logs.connectionStatus.' + connectionState) }}
            </span>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <!-- Search -->
            <UInput
              v-model="searchQuery"
              :placeholder="$t('dashboard.logs.search.placeholder')"
              size="sm"
              class="w-full sm:w-56 md:w-64"
              icon="tabler:search"
              :ui="{ trailing: 'pe-1' }"
            >
              <template
                v-if="searchQuery?.length"
                #trailing
              >
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
            <!-- Log level -->
            <USelect
              v-model="selectedLevels"
              :items="
                logLevels.map((level) => ({
                  label: level.toUpperCase(),
                  value: level,
                }))
              "
              multiple
              size="sm"
              :placeholder="$t('dashboard.logs.filter.levelPlaceholder')"
              class="w-28"
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
            <!-- Auto scroll -->
            <UButton
              icon="tabler:arrow-bar-to-down"
              color="neutral"
              size="sm"
              :variant="autoScroll ? 'outline' : 'soft'"
              class="ms-auto sm:ms-0"
              @click="toggleAutoScroll"
            />
            <!-- Download raw log -->
            <!-- TODO: Download raw log file -->
            <!-- <UButton 
            as="a"
            target="_blank"
            rel="noopener"
            icon="tabler:download"
            color="neutral"
            size="sm"
            variant="soft"
          /> -->
          </div>
        </div>
        <!-- 加载进度指示器 -->
        <div
          v-if="isInitialLoading"
          class="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-10"
        >
          <div class="text-center">
            <div class="mb-4">
              <UIcon
                name="tabler:loader-2"
                class="animate-spin w-8 h-8 text-blue-500"
              />
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {{ $t('dashboard.logs.connectionStatus.loadingHistory') }}
            </div>
            <div class="w-64 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                class="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                :style="{ width: `${loadingProgress}%` }"
              ></div>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ Math.round(loadingProgress) }}%
            </div>
          </div>
        </div>

        <div
          ref="logContainer"
          class="flex-1 min-h-0 overflow-y-auto overflow-x-auto scroll-smooth font-mono text-sm relative"
          @scroll="handleScroll"
        >
          <div
            class="relative"
            :style="{ height: `${totalVirtualHeight}px` }"
          >
            <div
              class="absolute left-0 right-0 px-2"
              :style="{ transform: `translateY(${virtualOffset}px)` }"
            >
              <div
                v-for="(log, index) in visibleLogs"
                :key="`${virtualStart + index}-${log.raw}`"
                :class="[
                  'px-2 py-0.5 rounded border-l-4',
                  getLogLineStyle(log),
                ]"
                :style="{ height: `${ROW_HEIGHT}px` }"
              >
                <div class="flex items-center space-x-3 text-sm h-full">
                  <!-- 时间戳 -->
                  <span
                    class="text-neutral-400 dark:text-neutral-500 text-xs whitespace-nowrap min-w-0 shrink-0"
                  >
                    {{ $dayjs(log.date).format('HH:mm:ss.SSS') }}
                  </span>

                  <!-- 日志级别 -->
                  <UBadge
                    size="sm"
                    :variant="log.level <= 1 ? 'solid' : 'soft'"
                    :color="getBadgeColor(log.type || getLevelType(log.level))"
                  >
                    {{
                      (log.type || getLevelType(log.level))
                        .toUpperCase()
                        .slice(0, 4)
                    }}
                  </UBadge>

                  <!-- 日志内容 -->
                  <div class="flex-1 min-w-0">
                    <span
                      v-if="normalizedSearchQuery"
                      class="block whitespace-nowrap overflow-hidden text-ellipsis"
                      v-html="highlightSearch(log.message)"
                    ></span>
                    <span
                      v-else
                      class="block whitespace-nowrap overflow-hidden text-ellipsis"
                    >
                      {{ log.message }}
                    </span>
                  </div>

                  <!-- 标签 -->
                  <span
                    v-if="log.tag"
                    class="text-xs whitespace-nowrap shrink-0 truncate text-neutral-400/80"
                  >
                    {{ log.tag }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 空状态 -->
            <div
              v-if="filteredLogs.length === 0"
              class="text-center py-8 text-gray-500 dark:text-gray-400 absolute inset-0"
            >
              <div v-if="logs.length === 0">{{ $t('dashboard.logs.empty.waiting') }}</div>
              <div v-else>{{ $t('dashboard.logs.empty.noMatch') }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* 自定义滚动条样式 */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: color-mix(in oklab, var(--ui-color-neutral-200) 50%, transparent);
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: color-mix(in oklab, var(--ui-color-neutral-400) 50%, transparent);
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: color-mix(in oklab, var(--ui-color-neutral-600) 50%, transparent);
}

mark {
  border-radius: 2px;
  padding: 0 2px;
}
</style>
