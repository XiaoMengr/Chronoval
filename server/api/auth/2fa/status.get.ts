export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  const db = useDB()
  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, session.user.id))
    .get()
  return { enabled: Boolean(user?.totpEnabled) }
})