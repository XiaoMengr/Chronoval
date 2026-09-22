/**
 * LRC 歌词解析（网易云式播放器用）。
 * 解析形如 `[mm:ss.xx]歌词文本` 的多行歌词为带时间戳的数组，
 * 未带时间戳的纯文本行（如元信息 `[ti:]`）会被过滤。
 */
export interface LrcLine {
  time: number // 秒
  text: string
}

/** 解析单个时间标签 `[mm:ss.xx]`，返回秒数；非法返回 null */
function parseTag(tag: string): number | null {
  const m = /^\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]$/.exec(tag.trim())
  if (!m) return null
  const min = Number(m[1])
  const sec = Number(m[2])
  const frac = m[3] ? Number(`0.${m[3].padEnd(3, '0')}`) : 0
  return min * 60 + sec + frac
}

/**
 * 解析 LRC 文本。返回按时间升序的歌词行数组。
 * 空/无时间戳的输入返回 []。
 */
export function parseLrc(lrc: string | null | undefined): LrcLine[] {
  if (!lrc || !lrc.trim()) return []
  const lines: LrcLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    // 提取一行内所有时间标签：`[00:12.3][00:30.1]歌词` → 两个时间点
    const tags = line.match(/\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\]/g)
    if (!tags || tags.length === 0) continue
    const text = line.replace(/\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\]/g, '').trim()
    if (!text) continue
    for (const tag of tags) {
      const t = parseTag(tag)
      if (t !== null) lines.push({ time: t, text })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}