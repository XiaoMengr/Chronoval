import { randomBytes } from 'node:crypto'
import { eq, tables, useDB, type Album } from '~~/server/utils/db'

type DB = ReturnType<typeof useDB>

/**
 * 生成普通相簿的不透明公开 UID。
 * 使用随机字节转 base36（约 9 位字符），不再暴露自增 id，避免公网链接被枚举。
 * 确保结果不是纯数字，以便公开访问路由能清晰区分「UID」与「数字 id」。
 */
export function generateAlbumUid(): string {
  let uid = ''
  do {
    const n = BigInt(`0x${randomBytes(6).toString('hex')}`)
    uid = n.toString(36)
  } while (/^\d+$/.test(uid) || uid.length < 8)
  return uid
}

/**
 * 惰性补全相簿 UID：存量相簿首次被读取时生成并落库，兼容迁移前已存在的数据。
 * 返回最终有效的 uid。
 */
export async function ensureAlbumUid(
  db: DB,
  album: Pick<Album, 'id' | 'uid'>,
): Promise<string> {
  if (album.uid) return album.uid

  // 在唯一索引兜底下，循环生成直到不冲突
  let uid = ''
  do {
    uid = generateAlbumUid()
    const exists = db
      .select({ id: tables.albums.id })
      .from(tables.albums)
      .where(eq(tables.albums.uid, uid))
      .get()
    if (!exists) break
  } while (true)

  db.update(tables.albums)
    .set({ uid, updatedAt: new Date() })
    .where(eq(tables.albums.id, album.id))
    .run()

  return uid
}