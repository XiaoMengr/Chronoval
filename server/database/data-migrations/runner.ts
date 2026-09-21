import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import { logger } from '../../utils/logger'
import { CURRENT_DATA_VERSION, MIGRATIONS } from './registry'
import type {
  AppliedMigration,
  DataMigrationReport,
  MigrationCtx,
} from './types'

const dataMigrateLogger = logger.dynamic('data-migrate')

/**
 * 执行「数据迁移」：在 drizzle schema 迁移成功之后调用。
 *
 * ▍能力
 *   - 持久化记录数据版本（app_meta.data_version），循环安全。
 *   - 只把「版本号大于当前库中版本」的增量迁移按序应用到新版本，实现自动过渡。
 *   - 每条迁移在独立事务中执行，失败自动 ROLLBACK 并向上抛错 → 阻塞应用启动。
 *   - 输出「差异对比」报告：旧版本 → 新版本，逐条展示迁移与受影响行数。
 *
 * ▍失败策略
 *   迁移一旦失败即抛出异常。由于本函数在 nitro 插件中 await 调用，
 *   服务进程不会正常监听端口（阻塞启动），避免在旧数据上以不兼容新版本运行。
 */
export async function runDataMigrations(
  dbPath: string,
): Promise<DataMigrationReport> {
  mkdirSync(dirname(dbPath), { recursive: true })
  const sqlite = new Database(dbPath)

  try {
    // 版本元表（与 drizzle schema 分离，专门记录数据迁移阶段）
    sqlite.exec(
      `CREATE TABLE IF NOT EXISTS app_meta (
          key   TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
       )`,
    )

    const dbVersion = readDataVersion(sqlite)
    const headVersion = CURRENT_DATA_VERSION

    const report: DataMigrationReport = {
      fromVersion: dbVersion,
      toVersion: dbVersion,
      applied: [],
      skipped: 0,
      dbVersion,
      headVersion,
    }

    // 库版本高于应用期望：疑似回滚/降级，不做向下迁移，仅记录告警
    if (dbVersion > headVersion) {
      report.skipped = dbVersion - headVersion
      dataMigrateLogger.warn(
        `数据版本 v${dbVersion} 高于应用支持的数据版本 v${headVersion}（疑似回滚/降级）。` +
          `不做向下迁移；请确认是否用旧版镜像覆盖了新版数据。`,
      )
      return report
    }

    const pending = MIGRATIONS.filter((m) => m.version > dbVersion)
      .slice()
      .sort((a, b) => a.version - b.version)

    // 存在版本空洞（注册表中的下一版本不是 dbVersion+1）——仍按序执行，仅提示
    const firstPending = pending[0]?.version
    if (pending.length > 0 && firstPending !== dbVersion + 1) {
      dataMigrateLogger.warn(
        `检测到数据版本存在空洞：当前库 v${dbVersion}，但下一可用迁移为 v${firstPending}。将跳过缺失的历史迁移并继续。`,
      )
    }

    if (pending.length === 0) {
      dataMigrateLogger.info(
        `数据差异对比：库 v${dbVersion} / 应用期望 v${headVersion}，无需迁移。`,
      )
      return report
    }

    const db = drizzle(sqlite)
    const setVersion = sqlite.prepare(
      `INSERT INTO app_meta (key, value)
         VALUES ('data_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )

    let toVersion = dbVersion
    for (const migration of pending) {
      const applied: AppliedMigration = {
        version: migration.version,
        id: migration.id,
        description: migration.description,
        changedRows: 0,
        durationMs: 0,
      }

      const ctx: MigrationCtx = {
        sqlite,
        db,
        report: (rowsAffected, detail) => {
          applied.changedRows = rowsAffected
          if (detail) applied.detail = detail
        },
      }

      const startedAt = Date.now()
      sqlite.exec('BEGIN')
      try {
        await migration.run(ctx)
        setVersion.run(String(migration.version))
        sqlite.exec('COMMIT')
      } catch (error) {
        sqlite.exec('ROLLBACK')
        dataMigrateLogger.error(
          `数据迁移 v${migration.version}「${migration.description}」失败，已回滚并阻塞启动：`,
          error,
        )
        throw error
      }

      applied.durationMs = Date.now() - startedAt
      toVersion = migration.version
      report.applied.push(applied)
      dataMigrateLogger.info(
        `已应用 数据迁移 v${migration.version}「${migration.description}」` +
          `影响 ${applied.changedRows} 行${applied.detail ? `（${applied.detail}）` : ''}（${applied.durationMs}ms）`,
      )
    }

    report.toVersion = toVersion

    const names = report.applied.map((a) => `v${a.version}:${a.id}`).join(', ')
    dataMigrateLogger.info(
      `数据迁移完成：v${report.fromVersion} → v${report.toVersion}` +
        (names ? `，共应用 ${report.applied.length} 项：${names}` : ''),
    )

    return report
  } finally {
    sqlite.close()
  }
}

function readDataVersion(sqlite: Database.Database): number {
  const row = sqlite
    .prepare(`SELECT value FROM app_meta WHERE key = 'data_version'`)
    .get() as { value?: string } | undefined
  if (!row) return 0
  const n = Number(row.value)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0
}