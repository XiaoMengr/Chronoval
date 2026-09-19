import z from 'zod'
import { hashAlbumPassword } from '~~/server/utils/scanAlbumPassword'
import { generateAlbumUid } from '~~/server/utils/albumUid'
import { eq, tables } from '~~/server/utils/db'

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
      // 首页照片画廊隐藏：开启后照片不进首页照片流
      hideFromGallery: z.boolean().optional(),
      // 照片展示布局：瀑布流 / 统一网格 / 沉浸式看图
      layout: z.enum(['waterfall', 'grid', 'immersive']).optional(),
      // 相簿访问密码（明文）：非空设置新密码
      password: z.string().max(128).optional(),
      // 自定义公开URL别名（可选）：全局唯一、URL 安全
      slug: z
        .string()
        .max(120)
        .nullable()
        .optional()
        .transform((v) => (v ? v.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') : v)),
    }).parse,
  )

  const db = useDB()

  // 密码处理：与扫描相簿一致，非空明文 → 带盐哈希存储
  const passwordHash = body.password?.trim()
    ? hashAlbumPassword(body.password.trim())
    : null

  // 自定义 URL 别名全局唯一；命中已有记录时回 409
  const slug = body.slug?.trim() || null
  if (slug) {
    const dup = db
      .select({ id: tables.albums.id })
      .from(tables.albums)
      .where(eq(tables.albums.slug, slug))
      .get()
    if (dup) {
      throw createError({ statusCode: 409, statusMessage: 'Slug already in use' })
    }
  }

  const album = db.transaction((tx) => {
    const newAlbum = tx
      .insert(tables.albums)
      .values({
        title: body.title,
        description: body.description || null,
        coverPhotoId: body.coverPhotoId || null,
        isHidden: body.isHidden || false,
        hideFromGallery: body.hideFromGallery || false,
        layout: body.layout || 'waterfall',
        passwordHash,
        password: body.password?.trim() || null,
        // 创建即分配不透明 UID
        uid: generateAlbumUid(),
        slug,
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
