import { z } from 'zod'

export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { code } = await readValidatedBody(
    event,
    z.object({ code: z.string().min(1).max(8) }).parse,
  )
  const db = useDB()

  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, session.user.id))
    .get()
  if (!user?.totpEnabled || !user.totpSecret) {
    throw createError({ statusCode: 409, message: '2FA is not enabled' })
  }
  if (!verifyTotp(user.totpSecret, code)) {
    throw createError({ statusCode: 400, message: 'Invalid verification code' })
  }

  db.update(tables.users)
    .set({ totpEnabled: false, totpSecret: null })
    .where(eq(tables.users.id, user.id))
    .run()

  return { enabled: false }
})