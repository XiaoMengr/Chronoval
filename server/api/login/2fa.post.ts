import { z } from 'zod'

const _invalidChallengeOrCode = createError({
  statusCode: 401,
  message: 'Invalid verification code or challenge expired',
})

export default eventHandler(async (event) => {
  const db = useDB()
  const { code } = await readValidatedBody(
    event,
    z.object({ code: z.string().min(1).max(8) }).parse,
  )

  const token = getCookie(event, totpConstants.CHALLENGE_COOKIE)
  if (!token) {
    throw _invalidChallengeOrCode
  }

  const userId = verifyChallenge(token)
  if (userId === null) {
    throw _invalidChallengeOrCode
  }

  const user = db.select().from(tables.users).where(eq(tables.users.id, userId)).get()
  if (!user || !user.totpEnabled || !user.totpSecret) {
    throw _invalidChallengeOrCode
  }

  if (!verifyTotp(user.totpSecret, code)) {
    recordLoginAttempt(event, {
      userId: user.id,
      email: user.email,
      method: 'two-factor',
      status: 'failed',
    })
    throw _invalidChallengeOrCode
  }

  // 两步验证通过：把本条挑战记录转为成功登入
  markChallengeAsSucceeded(event, user.id, user.email)

  await setUserSession(
    event,
    { user: toSessionUser(user) },
    {
      cookie: {
        secure: false,
      },
    },
  )

  // 挑战一次性：签发正式会话后立即清除挑战 Cookie
  deleteCookie(event, totpConstants.CHALLENGE_COOKIE, { path: '/' })

  return setResponseStatus(event, 201)
})