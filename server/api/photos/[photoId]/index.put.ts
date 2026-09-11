import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { exiftool } from 'exiftool-vendored'
import { eq } from 'drizzle-orm'

import { extractExifData } from '~~/server/services/image/exif'
import { tables, useDB } from '~~/server/utils/db'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'

const paramsSchema = z.object({
  photoId: z.string().min(1),
})

const bodySchema = z.object({
  title: z.string().trim().max(512).optional(),
  description: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().max(128)).max(64).optional(),
  location: z
    .union([
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      }),
      z.null(),
    ])
    .optional(),
  rating: z.union([z.number().int().min(0).max(5), z.null()]).optional(),
  // 360 全景手动标记：null=自动；1=强制全景；0=强制非全景
  isPanorama: z.union([z.literal(1), z.literal(0), z.literal(null)]).optional(),
  // 360 全景固定初始视角（度）；null=清除
  panoYaw: z.union([z.number().min(-360).max(360), z.null()]).optional(),
  panoPitch: z.union([z.number().min(-89).max(89), z.null()]).optional(),
})

const normalizeTags = (tags: string[] | undefined) => {
  if (!tags) return undefined
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const rawTag of tags) {
    const trimmed = rawTag.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(trimmed)
  }
  return normalized
}

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const t = await useTranslation(event)
  const { photoId } = paramsSchema.parse(event.context.params ?? {})
  const payload = bodySchema.parse(await readBody(event))

  if (
    payload.title === undefined &&
    payload.description === undefined &&
    payload.tags === undefined &&
    payload.location === undefined &&
    payload.rating === undefined &&
    payload.isPanorama === undefined &&
    payload.panoYaw === undefined &&
    payload.panoPitch === undefined
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: t('dashboard.photos.messages.noChangesProvided'),
    })
  }

  const db = useDB()
  const photo = await db
    .select()
    .from(tables.photos)
    .where(eq(tables.photos.id, photoId))
    .get()

  if (!photo) {
    throw createError({
      statusCode: 404,
      statusMessage: t('dashboard.photos.messages.photoNotFound'),
    })
  }

  // 仅修改「元数据类字段」（无 EXIF 对应、不需重写源文件）时：isPanorama / panoYaw / panoPitch
  // 直接更新数据库即可，避免重写源文件（全景图可能很大）。
  const hasFileEdit =
    payload.title !== undefined ||
    payload.description !== undefined ||
    payload.tags !== undefined ||
    payload.location !== undefined ||
    payload.rating !== undefined

  if (!hasFileEdit) {
    const dbSet: Record<string, number | null> = {}
    if (payload.isPanorama !== undefined) dbSet.isPanorama = payload.isPanorama
    if (payload.panoYaw !== undefined) dbSet.panoYaw = payload.panoYaw
    if (payload.panoPitch !== undefined) dbSet.panoPitch = payload.panoPitch

    if (Object.keys(dbSet).length > 0) {
      await db
        .update(tables.photos)
        .set(dbSet)
        .where(eq(tables.photos.id, photoId))

      const updatedPhoto = await db
        .select()
        .from(tables.photos)
        .where(eq(tables.photos.id, photoId))
        .get()

      return {
        success: true,
        photo: updatedPhoto,
      }
    }
  }

  if (!photo.storageKey) {
    throw createError({
      statusCode: 400,
      statusMessage: t('dashboard.photos.messages.noStorageKey'),
    })
  }

  const { storageProvider } = useStorageProvider(event)
  const originalBuffer = await storageProvider.get(photo.storageKey)

  if (!originalBuffer) {
    throw createError({
      statusCode: 404,
      statusMessage: t('dashboard.photos.messages.photoFileMissing'),
    })
  }

  const normalizedTitle =
    payload.title !== undefined ? payload.title.trim() : undefined
  const normalizedDescription =
    payload.description !== undefined ? payload.description.trim() : undefined
  const normalizedTags = normalizeTags(payload.tags)
  let pendingReverseGeocode: {
    latitude: number
    longitude: number
  } | null = null

  const exifUpdates: Record<string, any> = {}

  if (normalizedTitle !== undefined) {
    const titleValue = normalizedTitle.length > 0 ? normalizedTitle : null
    exifUpdates.Title = titleValue
    exifUpdates.XPTitle = titleValue
  }

  if (normalizedDescription !== undefined) {
    const descriptionValue =
      normalizedDescription.length > 0 ? normalizedDescription : null
    exifUpdates.Description = descriptionValue
    exifUpdates.ImageDescription = descriptionValue
    exifUpdates.CaptionAbstract = descriptionValue
    exifUpdates.XPComment = descriptionValue
    exifUpdates.UserComment = descriptionValue
  }

  if (normalizedTags !== undefined) {
    const tagsValue = normalizedTags.length > 0 ? normalizedTags : null
    exifUpdates.Subject = tagsValue
    exifUpdates.Keywords = tagsValue
    exifUpdates.XPKeywords =
      normalizedTags.length > 0 ? normalizedTags.join('; ') : null
  }

  if (payload.location !== undefined) {
    if (payload.location) {
      const { latitude, longitude } = payload.location
      const latAbs = Math.abs(latitude)
      const lonAbs = Math.abs(longitude)
      exifUpdates.GPSLatitude = latAbs
      exifUpdates.GPSLatitudeRef = latitude >= 0 ? 'N' : 'S'
      exifUpdates.GPSLongitude = lonAbs
      exifUpdates.GPSLongitudeRef = longitude >= 0 ? 'E' : 'W'
      exifUpdates.GPSPosition = `${latitude} ${longitude}`
    } else {
      exifUpdates.GPSLatitude = null
      exifUpdates.GPSLatitudeRef = null
      exifUpdates.GPSLongitude = null
      exifUpdates.GPSLongitudeRef = null
      exifUpdates.GPSPosition = null
    }
  }

  if (payload.rating !== undefined) {
    exifUpdates.Rating = payload.rating !== null ? payload.rating : null
  }

  const tempRoot = tmpdir()
  await mkdir(tempRoot, { recursive: true })
  const tempDir = await mkdtemp(path.join(tempRoot, 'cframe-edit-'))
  const ext = path.extname(photo.storageKey) || '.jpg'
  const tempFile = path.join(tempDir, `edited${ext}`)

  try {
    await writeFile(tempFile, originalBuffer)

    if (Object.keys(exifUpdates).length > 0) {
      await exiftool.write(tempFile, exifUpdates, ['-overwrite_original'])
    }

    const updatedBuffer = await readFile(tempFile)
    const prefix =
      storageProvider.config && 'prefix' in storageProvider.config
        ? storageProvider.config.prefix
        : ''
    await storageProvider.create(
      photo.storageKey.replace(prefix || '', ''),
      updatedBuffer,
    )

    const exifData = await extractExifData(updatedBuffer)

    const updateData: Record<string, any> = {
      exif: exifData,
      fileSize: updatedBuffer.length,
      lastModified: new Date().toISOString(),
    }

    if (normalizedTitle !== undefined) {
      updateData.title = normalizedTitle || null
    }

    if (normalizedDescription !== undefined) {
      updateData.description = normalizedDescription || null
    }

    if (normalizedTags !== undefined) {
      updateData.tags = normalizedTags
    }

    if (payload.isPanorama !== undefined) {
      updateData.isPanorama = payload.isPanorama
    }

    if (payload.panoYaw !== undefined) {
      updateData.panoYaw = payload.panoYaw
    }

    if (payload.panoPitch !== undefined) {
      updateData.panoPitch = payload.panoPitch
    }

    if (payload.location !== undefined) {
      if (payload.location) {
        updateData.latitude = payload.location.latitude
        updateData.longitude = payload.location.longitude
        updateData.country = null
        updateData.city = null
        updateData.locationName = null
        pendingReverseGeocode = {
          latitude: payload.location.latitude,
          longitude: payload.location.longitude,
        }
      } else {
        updateData.latitude = null
        updateData.longitude = null
        updateData.country = null
        updateData.city = null
        updateData.locationName = null
      }
    }

    await db
      .update(tables.photos)
      .set(updateData)
      .where(eq(tables.photos.id, photoId))

    const updatedPhoto = await db
      .select()
      .from(tables.photos)
      .where(eq(tables.photos.id, photoId))
      .get()

    if (pendingReverseGeocode) {
      const workerPool = globalThis.__workerPool
      if (workerPool) {
        try {
          await workerPool.addTask(
            {
              type: 'photo-reverse-geocoding',
              photoId,
              latitude: pendingReverseGeocode.latitude,
              longitude: pendingReverseGeocode.longitude,
            },
            {
              priority: 1,
            },
          )
        } catch (taskError) {
          logger.location.warn(
            `Failed to enqueue reverse geocoding for photo ${photoId}:`,
            taskError,
          )
        }
      } else {
        logger.location.warn(
          `Worker pool not initialized, skipping reverse geocoding enqueue for photo ${photoId}`,
        )
      }
    }

    return {
      success: true,
      photo: updatedPhoto,
    }
  } catch (error) {
    logger.image.error('Failed to update photo metadata', error)
    throw createError({
      statusCode: 500,
      statusMessage: t('dashboard.photos.messages.metadataUpdateFailed'),
    })
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
