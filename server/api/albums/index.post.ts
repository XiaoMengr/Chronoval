import z from 'zod'
import { hashAlbumPassword } from '~~/server/utils/scanAlbumPassword'

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const body = await readValidatedBody(
    event,
    z.object({
      title: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      coverPhotoId: z.string().optional(),
      photoIds: z.array(z.string()).optional(),
      isHidden: z.boolean().optional(),
      // 相簿访问密码（明文）：非空设置新密码
      password: z.string().max(128).optional(),
    }).parse,
  )

  const db = useDB()

  // 密码处理：与扫描相簿一致，非空明文 → 带盐哈希存储
  const passwordHash = body.password?.trim()
    ? hashAlbumPassword(body.password.trim())
    : null

  const album = db.transaction((tx) => {
    const newAlbum = tx
      .insert(tables.albums)
      .values({
        title: body.title,
        description: body.description || null,
        coverPhotoId: body.coverPhotoId || null,
        isHidden: body.isHidden || false,
        passwordHash,
      })
      .returning()
      .get()

    const albumId = newAlbum.id
    const photoIds = new Set(body.photoIds || [])

    if (body.coverPhotoId) {
      photoIds.add(body.coverPhotoId)
    }

    if (photoIds.size > 0) {
      let pos = 1000000
      for (const photoId of photoIds) {
        tx.insert(tables.albumPhotos)
          .values({
            albumId,
            photoId,
            position: (pos += 10),
          })
          .onConflictDoNothing()
          .run()
      }
    }

    return newAlbum
  })

  // 不回传密码哈希
  const { passwordHash: _ph, ...safeAlbum } = album
  return safeAlbum
})
