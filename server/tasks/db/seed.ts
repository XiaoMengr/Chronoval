export default defineTask({
  meta: {
    name: 'db:seed',
    description: 'Seed the database with default admin user',
  },
  async run() {
    const log = logger.dynamic('db')
    const db = useDB()

    log.info('Seeding database with default admin user...')
    const users = await db.select().from(tables.users)

    if (users.length > 0) {
      log.info('User already exists, skipping seeding.')
    } else {
      log.info('No users found, creating default admin user...')
      await db.insert(tables.users).values({
        username: process.env.CFRAME_ADMIN_NAME || 'chronoframe',
        email: process.env.CFRAME_ADMIN_EMAIL || 'admin@chronoframe.com',
        password: await hashPassword(
          process.env.CFRAME_ADMIN_PASSWORD || 'CF1234@!',
        ),
        createdAt: new Date(),
        isAdmin: 1,
      })
      log.success('Default admin user created.')
    }

    return {
      result: 'success',
    }
  },
})
