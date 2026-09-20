import { z } from 'zod'
import { hashAlbumPassword } from '~~/server/utils/scanAlbumPassword'
import { ensureAlbumUid } from '~~/server/utils/albumUid'

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({
      albumId: z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10)),
    }).parse,
  )

  const body = await readValidatedBody(
    event,
    z.object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(1000).optional(),
      coverPhotoId: z.string().optional(),
      photoIds: z.array(z.string()).optional(),
      isHidden: z.boolean().optional(),
      // 首页照片画廊隐藏：开启后照片不进首页照片流
      hideFromGallery: z.boolean().optional(),
      // 相簿访问密码（明文）：配合 clearPassword 完成 设置/清除/保持
      password: z.string().max(128).optional(),
      clearPassword: z.boolean().optional(),
      // 照片展示布局：瀑布流 / 统一网格
      layout: z.enum(['waterfall', 'grid', 'immersive', 'timeline']).optional(),
      // 「随机一张照片」是否使用 3D 轮盘动画
      randomWheelAnimation: z.boolean().optional(),
      // 自定义公开URL别名：可选；未传则保持，null/空串则清除
      slug: z
        .string()
        .max(120)
        .nullable()
        .optional()
        .transform((v) => (v ? v.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') : v)),
    }).parse,
  )

  const db = useDB()

  // 检查相簿是否存在
  const album = await db
    .select()
    .from(tables.albums)
    .where(eq(tables.albums.id, albumId))
    .get()

  if (!album) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Album not found',
    })
  }

  // 自定义 URL 别名：未传则保持；null/空串则清除；非空则查重后设置
  let nextSlug: string | null | undefined
  if (body.slug !== undefined) {
    nextSlug = body.slug?.trim() || null
    if (nextSlug) {
      const dup = db
        .select({ id: tables.albums.id })
        .from(tables.albums)
        .where(eq(tables.albums.slug, nextSlug))
        .all()
        .find((r) => r.id !== albumId)
      if (dup) {
        throw createError({ statusCode: 409, statusMessage: 'Slug already in use' })
      }
    }
  }

  // 使用事务更新相簿
  const updatedAlbum = db.transaction((tx) => {
    // 更新基本信息
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    }


    if (nextSlug !== undefined) {
      updateData.slug = nextSlug
    }

    if (body.layout !== undefined) {
      updateData.layout = body.layout
    }

    if (body.randomWheelAnimation !== undefined) {
      updateData.randomWheelAnimation = body.randomWheelAnimation
    }

    if (body.title !== undefined) {
      updateData.title = body.title
    }

    if (body.description !== undefined) {
      updateData.description = body.description || null
    }

    if (body.coverPhotoId !== undefined) {
      updateData.coverPhotoId = body.coverPhotoId || null
    }
    if (body.isHidden !== undefined) {
      updateData.isHidden = body.isHidden
    }
    if (body.hideFromGallery !== undefined) {
      updateData.hideFromGallery = body.hideFromGallery
    }

    // 密码处理：clearPassword=true → 清除；非空明文 → 设置新密码；否则保持不变
    // password（明文）与 passwordHash 同步维护：明文仅供管理端回显，验证仍以哈希为准。
    if (body.clearPassword) {
      updateData.passwordHash = null
      updateData.password = null
    } else if (body.password?.trim()) {
      const plain = body.password.trim()
      updateData.passwordHash = hashAlbumPassword(plain)
      updateData.password = plain
    }

    // 修改密码后之前的解锁 Cookie 立即失效

    tx.update(tables.albums)
      .set(updateData)
      .where(eq(tables.albums.id, albumId))
      .run()

    // 如果提供了新的照片列表，替换现有照片
    if (body.photoIds !== undefined) {
      // 删除现有的相簌-照片关系
      tx.delete(tables.albumPhotos)
        .where(eq(tables.albumPhotos.albumId, albumId))
        .run()

      // 添加新的相簌-照片关系
      const photoIds = new Set(body.photoIds)

      // 确保 coverPhotoId 在列表中
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
    }

    return tx
      .select()
      .from(tables.albums)
      .where(eq(tables.albums.id, albumId))
      .get()
  })

  // 事务后相簿应必然存在；防御性兜底
  if (!updatedAlbum) {
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  }

  // 惰性补全并返回公开 UID
  const uid = await ensureAlbumUid(db, updatedAlbum)

  // 不回传密码哈希
  const { passwordHash: _ph, ...safeAlbum } = { ...updatedAlbum, uid }
  return safeAlbum
})
