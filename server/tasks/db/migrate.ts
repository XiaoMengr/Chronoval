import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

export default defineTask({
  meta: {
    name: 'db:migrate',
    description: 'Migrate the database',
  },
  async run() {
    const log = logger.dynamic('db')
    const db = useDB()

    log.info('Migrating database...')

    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)

    migrate(db, {
      migrationsFolder: join(__dirname, '../../server/database/migrations'),
    })

    log.success('Database migrated successfully.')

    return {
      result: 'success',
    }
  },
})
