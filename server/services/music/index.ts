import { useDB, tables, eq } from '../../utils/db'

export type MusicRow = typeof tables.music.$inferSelect

export const STREAM_BASE = '/api/music'

/** 序列化音乐记录为客户端可用对象（含可播放的流式 URL） */
export const serializeMusic = (
  m: MusicRow,
): {
  id: number
  title: string
  filename: string
  mimeType: string | null
  duration: number | null
  fileSize: number
  url: string
  createdAt: Date
} => ({
  id: m.id,
  title: m.title,
  filename: m.filename,
  mimeType: m.mimeType,
  duration: m.duration,
  fileSize: m.fileSize,
  url: `${STREAM_BASE}/${m.id}/stream`,
  createdAt: m.createdAt,
})

/** 读取一条音乐记录 */
export const getMusicById = async (id: number): Promise<MusicRow | null> => {
  const db = useDB()
  return (
    (await db
      .select()
      .from(tables.music)
      .where(eq(tables.music.id, id))
      .get()) ?? null
  )
}

/** 读取全部音乐记录（按创建时间正序） */
export const listMusic = async (): Promise<MusicRow[]> => {
  const db = useDB()
  return db
    .select()
    .from(tables.music)
    .orderBy(tables.music.createdAt)
    .all()
}