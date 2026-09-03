import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_INITIAL_LINES = 400
const MAX_INITIAL_LINES = 2000
const ALL_INITIAL_LINES = 'all'

type InitialLinesMode = number | typeof ALL_INITIAL_LINES

const clampInitialLines = (value: unknown): InitialLinesMode => {
  if (typeof value === 'string' && value.toLowerCase() === ALL_INITIAL_LINES) {
    return ALL_INITIAL_LINES
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_INITIAL_LINES
  }
  return Math.max(0, Math.min(MAX_INITIAL_LINES, Math.floor(parsed)))
}

const readLastLines = async (
  filePath: string,
  maxLines: number,
): Promise<{ lines: string[]; fileSize: number }> => {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const stat = await handle.stat()
    const fileSize = stat.size

    if (maxLines <= 0 || fileSize <= 0) {
      return { lines: [], fileSize }
    }

    const chunkSize = 64 * 1024
    const maxReadBytes = 2 * 1024 * 1024
    let position = fileSize
    let totalReadBytes = 0
    let content = ''
    let newlineCount = 0

    while (position > 0 && newlineCount <= maxLines && totalReadBytes < maxReadBytes) {
      const readSize = Math.min(chunkSize, position)
      const start = position - readSize
      const chunk = Buffer.allocUnsafe(readSize)
      const { bytesRead } = await handle.read(chunk, 0, readSize, start)
      if (bytesRead <= 0) {
        break
      }

      content = chunk.toString('utf-8', 0, bytesRead) + content
      position = start
      totalReadBytes += bytesRead
      newlineCount = (content.match(/\n/g) || []).length
    }

    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-maxLines)

    return { lines, fileSize }
  } finally {
    await handle.close()
  }
}

const readAllLines = async (
  filePath: string,
): Promise<{ lines: string[]; fileSize: number }> => {
  const stat = await fs.promises.stat(filePath)
  if (stat.size <= 0) {
    return { lines: [], fileSize: stat.size }
  }

  const content = await fs.promises.readFile(filePath, 'utf-8')
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return { lines, fileSize: stat.size }
}

const streamNewLines = async (
  filePath: string,
  fromOffset: number,
): Promise<{ lines: string[]; nextOffset: number }> => {
  const stat = await fs.promises.stat(filePath)
  const safeOffset = Math.max(0, Math.min(fromOffset, stat.size))
  const nextOffset = stat.size

  if (nextOffset <= safeOffset) {
    return { lines: [], nextOffset }
  }

  const stream = fs.createReadStream(filePath, {
    encoding: 'utf-8',
    start: safeOffset,
    end: nextOffset - 1,
  })

  let buffer = ''
  for await (const chunk of stream) {
    buffer += chunk
  }

  const lines = buffer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return { lines, nextOffset }
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const eventStream = createEventStream(event)

  const logFilePath = path.join(process.cwd(), 'data', 'logs', 'app.log')
  const logDirPath = path.dirname(logFilePath)
  const query = getQuery(event)
  const initialLines = clampInitialLines(query.initial)

  fs.mkdirSync(logDirPath, { recursive: true })

  let lastReadOffset = 0
  let isClosed = false
  let flushScheduled = false
  let isFlushing = false

  setImmediate(async () => {
    try {
      if (fs.existsSync(logFilePath)) {
        const { lines, fileSize } =
          initialLines === ALL_INITIAL_LINES
            ? await readAllLines(logFilePath)
            : await readLastLines(logFilePath, initialLines)
        for (const line of lines) {
          if (isClosed) {
            return
          }
          await eventStream.push(line)
        }
        lastReadOffset = fileSize
      }
    } catch (error) {
      console.error('Error initializing log stream:', error)
    }
  })

  const flushNewLogs = async () => {
    if (isClosed || isFlushing) {
      return
    }

    isFlushing = true
    try {
      if (!fs.existsSync(logFilePath)) {
        lastReadOffset = 0
        return
      }

      const stat = await fs.promises.stat(logFilePath)
      if (stat.size < lastReadOffset) {
        // 日志被截断或轮转，重置偏移
        lastReadOffset = 0
      }

      const { lines, nextOffset } = await streamNewLines(logFilePath, lastReadOffset)
      for (const line of lines) {
        if (isClosed) {
          return
        }
        await eventStream.push(line)
      }
      lastReadOffset = nextOffset
    } catch (error) {
      console.error('Error flushing log stream:', error)
    } finally {
      isFlushing = false
      if (flushScheduled) {
        flushScheduled = false
        setImmediate(() => {
          void flushNewLogs()
        })
      }
    }
  }

  const scheduleFlush = () => {
    flushScheduled = true
    setImmediate(() => {
      void flushNewLogs()
    })
  }

  const watcher = fs.watch(logDirPath, (_eventType, filename) => {
    if (!filename) {
      return
    }
    if (filename.toString() === path.basename(logFilePath)) {
      scheduleFlush()
    }
  })

  eventStream.onClosed(async () => {
    isClosed = true
    watcher.close()
    await eventStream.close()
  })

  return eventStream.send()
})
