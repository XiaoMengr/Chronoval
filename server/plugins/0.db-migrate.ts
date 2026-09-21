import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import { runDataMigrations } from '../database/data-migrations/runner'

let migrationPromise: Promise<void> | null = null
const migrationLogger = logger.dynamic('db-migrate')

async function runMigrations() {
  const dbPath = resolve(process.env.DATABASE_URL || './data/app.sqlite3')

  mkdirSync(dirname(dbPath), { recursive: true })

  // 阶段一：Drizzle schema 迁移（DDL，建表/改列）
  const sqlite = new Database(dbPath)
  try {
    const db = drizzle(sqlite)
    await migrate(db, {
      migrationsFolder: resolve('./server/database/migrations'),
    })
    migrationLogger.info('Database schema migration finished successfully')
  } finally {
    sqlite.close()
  }

  // 阶段二：数据迁移（在 schema 就绪后执行）—— 把存量数据自动过渡到新版本。
  // 任一步失败将自动回滚并抛错，从而在 nitro 插件层阻塞应用启动，
  // 避免以新代码运行在未对齐的旧数据上。
  await runDataMigrations(dbPath)
}

export default defineNitroPlugin(async () => {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((error) => {
      migrationLogger.error('Database migration failed', error)
      throw error
    })
  }

  await migrationPromise
})
