import path from 'node:path'
import { promises as fs } from 'node:fs'
import { getLibraryMounts } from '~~/server/services/scan-library/manager'

const HEIC_EXTENSIONS = ['.heic', '.heif', '.hif']

/**
 * 从回收站彻底删除照片：移除数据库记录并删除原图 / 缩略图 / 实况视频文件。
 * 这是不可逆操作。仅管理员可访问。
 */
export default eventHandler(async (event) => {
  await requireUserSession(event)
  const { storageProvider } = useStorageProvider(event)
  const photoId = getRouterParam(event, 'photoId')

  if (!photoId) {
    return createError({
      statusCode: 400,
      statusMessage: 'Photo ID is required',
    })
  }

  const photo = await useDB()
    .select()
    .from(tables.photos)
    .where(eq(tables.photos.id, photoId))
    .get()

  if (!photo) {
    return createError({
      statusCode: 404,
      statusMessage: 'Photo not found',
    })
  }

  if (!photo.deletedAt) {
    return createError({
      statusCode: 409,
      statusMessage: 'Photo is not in the trash',
    })
  }

  logger.image.info(`Permanently deleting photo ${photo.title || photo.id || photoId}`)

  // 库目录来源：原文件位于映射目录，不写入存储也不删除原文件。
  // 缩略图为就地生成在 <mountRoot>/thumbnails/ 下，用 fs 直接删除（不经过 storageProvider）。
  const isLibrarySource = photo.source === 'library'
  if (photo.thumbnailKey && isLibrarySource) {
    const mount = getLibraryMounts().find((m) => m.name === photo.libraryMount)
    if (mount) {
      const thumbAbs = path.resolve(mount.root, photo.thumbnailKey)
      if (thumbAbs.startsWith(path.resolve(mount.root) + path.sep)) {
        try {
          await fs.unlink(thumbAbs)
          // 尝试清理空的 thumbnails 目录
          await fs.rmdir(path.dirname(thumbAbs)).catch(() => {})
        } catch (err) {
          logger.image.warn(
            `Failed to remove in-place thumbnail ${thumbAbs}:`,
            err,
          )
        }
      }
    }
  }

  if (!isLibrarySource && photo.storageKey) {
    logger.image.info(`Deleting photo files for ${photoId} from storage`)
    try {
      await storageProvider.delete(photo.storageKey)
      const lowerStorageKey = photo.storageKey.toLowerCase()
      const heicExtension = HEIC_EXTENSIONS.find((ext) =>
        lowerStorageKey.endsWith(ext),
      )
      if (heicExtension) {
        const jpegKey =
          photo.storageKey.slice(
            0,
            photo.storageKey.length - heicExtension.length,
          ) + '.jpeg'

        if (jpegKey !== photo.storageKey) {
          logger.image.info(
            `Deleting converted JPEG for HEIC photo ${photoId}: ${jpegKey}`,
          )
          try {
            await storageProvider.delete(jpegKey)
          } catch {
            // ignore error when deleting converted JPEG
          }
        }
      }
      if (photo.thumbnailKey) {
        await storageProvider.delete(photo.thumbnailKey)
      }
      if (photo.livePhotoVideoKey) {
        await storageProvider.delete(photo.livePhotoVideoKey)
      }
    } catch {
      // ignore error
    }
  }

  useDB().delete(tables.photos).where(eq(tables.photos.id, photoId)).run()

  logger.image.success(`Photo ${photoId} permanently deleted`)

  return {
    statusCode: 200,
    statusMessage: 'Photo permanently deleted',
  }
})