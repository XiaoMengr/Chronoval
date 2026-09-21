import { randomBytes } from 'node:crypto'

import type { DataMigration } from './types'

/**
 * 数据迁移注册表。
 *
 * ▍使用规则
 *   - 只允许【追加】（已发布的版本号不可改动/删除，否则老数据会重复或错乱迁移）。
 *   - 每新增一条迁移：在 MIGRATIONS 尾部追加，并把 CURRENT_DATA_VERSION 递增。
 *   - 迁移函数必须【幂等】：即便数据库里没有脏数据（新装），也应安全地空跑。
 *   - 每条迁移在独立事务中执行，失败自动回滚且阻塞启动（见 runner）。
 *
 * ▍版本号
 *   CURRENT_DATA_VERSION 表示「当前应用期望的数据版本」。数据库中通过
 *   app_meta.data_version 记录已到达的版本。启动时自动把旧数据迁移到该版本。
 */
export const CURRENT_DATA_VERSION = 2

/** 生成不透明的公开相簿 UID（与 server/utils/albumUid.ts 的生成规则一致） */
function generateAlbumUid(): string {
  let uid = ''
  do {
    uid = BigInt(`0x${randomBytes(6).toString('hex')}`).toString(36)
  } while (/^\d+$/.test(uid) || uid.length < 8)
  return uid
}

export const MIGRATIONS: DataMigration[] = [
  // ===== v1 =====
  {
    version: 1,
    id: 'backfill-photo-aspect-ratio',
    description: '为已有宽高但缺失长宽比的照片补齐 aspect_ratio',
    run: (ctx) => {
      const res = ctx.sqlite
        .prepare(
          `UPDATE photos
              SET aspect_ratio = ROUND(CAST(width AS REAL) / height, 6)
            WHERE aspect_ratio IS NULL
              AND width IS NOT NULL
              AND height IS NOT NULL
              AND height <> 0`,
        )
        .run()
      ctx.report(res.changes, '由 width/height 推算 aspect_ratio（忽略缺失或 height=0 的行）')
    },
  },

  // ===== v2 =====
  {
    version: 2,
    id: 'backfill-album-uid',
    description: '为缺失公开 UID 的相簿生成不透明公开 UID',
    run: (ctx) => {
      const exists = ctx.sqlite.prepare(`SELECT 1 AS x FROM albums WHERE uid = ?`)
      const rows = ctx.sqlite
        .prepare(`SELECT id FROM albums WHERE uid IS NULL OR uid = ''`)
        .all() as { id: number }[]
      const update = ctx.sqlite.prepare(
        `UPDATE albums SET uid = ?, updated_at = unixepoch()
          WHERE id = ? AND (uid IS NULL OR uid = '')`,
      )
      let changed = 0
      for (const row of rows) {
        let uid = ''
        let guard = 0
        do {
          uid = generateAlbumUid()
          guard++
        } while (exists.get(uid) && guard < 10000)
        if (exists.get(uid)) {
          throw new Error(`迁移 v2 无法生成不冲突的相簿 UID（id=${row.id}）`)
        }
        const res = update.run(uid, row.id)
        if (res.changes > 0) changed++
      }
      ctx.report(changed, '为存量相簿生成公开 UID（唯一索引兜底去重）')
    },
  },
]

/** 供 runner 使用的查询：查找某数据版本在注册表中的描述（缺失时返回 null） */
export function findMigrationDescription(version: number): string | null {
  return MIGRATIONS.find((m) => m.version === version)?.description ?? null
}