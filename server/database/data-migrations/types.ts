import type Database from 'better-sqlite3'
import type { drizzle } from 'drizzle-orm/better-sqlite3'

/**
 * 一条「数据迁移」定义。
 * 相较于 Drizzle schema 迁移（DDL，只管建表/改列），数据迁移用于把存量数据
 * 从旧版本安全地「过渡」到新版本：补齐缺省字段、转换旧数据、清理脏数据等。
 * 每新增一次针对新功能/改动的数据整理，就追加一条并递增 CURRENT_DATA_VERSION。
 */
export interface DataMigration {
  /** 数据版本号（单调递增整数，必须大于前一条） */
  version: number
  /** 唯一标识（稳定，不随文字修改变化） */
  id: string
  /** 人类可读描述 */
  description: string
  /** 迁移逻辑；可以是同步或异步。所有语句必须基于本事务内的 ctx.sqlite/ctx.db。 */
  run: (ctx: MigrationCtx) => void | Promise<void>
}

/** 提供给每条迁移的执行上下文 */
export interface MigrationCtx {
  /** 裸 better-sqlite3 连接（迁移内推荐用原生 SQL，简单可控） */
  sqlite: Database.Database
  /** drizzle 连接（便于复用既有查询逻辑，如需对象映射） */
  db: ReturnType<typeof drizzle>
  /**
   * 汇报本次迁移的影响行数与说明，用于启动时输出「差异对比」报告。
   * 建议只在数据实际发生变更（增量）时调用。
   */
  report: (rowsAffected: number, detail?: string) => void
}

/** 一条已成功应用的数据迁移（用于报告） */
export interface AppliedMigration {
  version: number
  id: string
  description: string
  changedRows: number
  durationMs: number
  detail?: string
}

/** 一次启动的数据迁移汇总报告 */
export interface DataMigrationReport {
  /** 迁移前数据库中的数据版本 */
  fromVersion: number
  /** 迁移后数据库中的数据版本 */
  toVersion: number
  /** 本次实际应用了哪些迁移（按版本升序） */
  applied: AppliedMigration[]
  /** 数据库版本高于应用期望版本（疑似回滚/降级）时跳过的差额 */
  skipped: number
  /** atVersion 状态用：数据库中报告的版本（等于 fromVersion） */
  dbVersion: number
  /** 当前应用支持的最新数据版本 */
  headVersion: number
}