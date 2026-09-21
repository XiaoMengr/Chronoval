import { and, eq, isNotNull, lt } from 'drizzle-orm'
import type { StorageProvider } from '../storage'
import { getStorageManager } from '../../plugins/3.storage'
import { useDB, tables, type Photo } from '../../utils/db'

const HEIC_EXTENSIONS = ['.heic', '.heif', '.hif']

/**
 * 从回收站彻底删除一张照片：删除原图 / 缩略图 / 实况视频文件并移除数据库记录。
 * 这是不可逆操作。供「手动彻底删除」与「定时清理过期回收站照片」共用。
 *
 * @param photo 需彻底删除的照片记录（必须已处于回收站，即 deletedAt 非空）
 */
export async function permanentlyDeletePhoto(
  photo: Photo,
  importedStorageProvider?: StorageProvider,
): Promise<void> {
  let storageProvider = importedStorageProvider
  if (!storageProvider) {
    try {
      storageProvider = getStorageManager().getProvider() as StorageProvider
    } catch (err) {
      logger.image.warn(
        `(cleanup) Storage manager not available, skip file deletion for ${photo.id}`,
        err,
      )
    }
  }

  logger.image.info(
    `(cleanup) Permanently deleting photo ${photo.title || photo.id}`,
  )

  const isLibrarySource = photo.source === 'library'
  // 库目录来源：原文件位于映射目录，不写入存储也不删除原文件。
  // 缩略图统一存于内部存储（thumbnails/<mount>/…），按存储 key 删除，外部库目录不再就地生成。
  if (photo.thumbnailKey && isLibrarySource && storageProvider) {
    try {
      await storageProvider.delete(photo.thumbnailKey)
    } catch (err) {
      logger.image.warn(
        `Failed to remove library thumbnail ${photo.thumbnailKey}:`,
        err,
      )
    }
  }

  if (!isLibrarySource && photo.storageKey && storageProvider) {
    logger.image.info(`Deleting photo files for ${photo.id} from storage`)
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
            `Deleting converted JPEG for HEIC photo ${photo.id}: ${jpegKey}`,
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
    } catch (err) {
      logger.image.warn(
        `Failed to delete photo files for ${photo.id} from storage:`,
        err,
      )
    }
  }

  useDB().delete(tables.photos).where(eq(tables.photos.id, photo.id)).run()
  logger.image.success(`Photo ${photo.id} permanently deleted`)
}

/**
 * 清理回收站中已过保留期的照片。
 * @param retentionDays 保留天数；若为 null / 'never' 则不移除任何已到期的策略（永不自动删除）
 * @returns 本次实际彻底删除的照片数量
 */
export async function cleanupExpiredTrashPhotos(
  retentionDays: number | null,
): Promise<number> {
  if (!retentionDays || retentionDays <= 0) {
    logger.image.info(
      '(cleanup) Trash retention set to never-delete, skipping automatic cleanup',
    )
    return 0
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

  const expired = useDB()
    .select()
    .from(tables.photos)
    .where(
      and(
        isNotNull(tables.photos.deletedAt),
        lt(tables.photos.deletedAt, cutoff),
      ),
    )
    .all()

  if (expired.length === 0) {
    logger.image.info(
      `(cleanup) No trash photos older than ${retentionDays} days to purge`,
    )
    return 0
  }

  logger.image.info(
    `(cleanup) Purging ${expired.length} trash photo(s) older than ${retentionDays} days`,
  )

  for (const photo of expired) {
    try {
      await permanentlyDeletePhoto(photo as Photo)
    } catch (err) {
      logger.image.error(
        `(cleanup) Failed to purge photo ${photo.id}:`,
        err,
      )
    }
  }

  return expired.length
}