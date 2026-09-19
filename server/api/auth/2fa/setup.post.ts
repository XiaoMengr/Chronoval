import QRCode from 'qrcode'

export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  const db = useDB()

  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, session.user.id))
    .get()
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  // 已开启：不再暴露/重置密钥
  if (user.totpEnabled) {
    return { enabled: true, secret: null as string | null, otpauth: null as string | null, qr: null as string | null }
  }

  // 复用尚未确认的 pending secret，保证刷新页面后二维码一致
  let secret = user.totpSecret
  if (!secret) {
    secret = generateTotpSecret()
    db.update(tables.users)
      .set({ totpSecret: secret })
      .where(eq(tables.users.id, user.id))
      .run()
  }

  const account = user.email || user.username
  const otpauth = buildTotpUri({ secret, account, issuer: 'Chronoval' })
  const qr = await QRCode.toDataURL(otpauth, {
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'M',
  })

  return {
    enabled: false,
    secret,
    otpauth,
    qr,
    account,
  }
})