import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { NeededExif } from '~~/shared/types/photo'
import type { StorageConfig } from '../services/storage'

type PipelineQueuePayload =
  | {
      type: 'photo'
      storageKey: string
      eraseLocation?: boolean
    }
  | {
      type: 'live-photo-video'
      storageKey: string
    }
  | {
      type: 'photo-reverse-geocoding'
      photoId: string
      latitude?: number | null
      longitude?: number | null
    }
  | {
      type: 'photo-erase-location'
      photoId: string
    }

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('name').notNull().unique(),
  email: text('email').notNull().unique(),
  password: text('password'),
  avatar: text('avatar'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  isAdmin: integer('is_admin').default(0).notNull(),
})

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey().unique(),
  title: text('title'),
  description: text('description'),
  width: integer('width'),
  height: integer('height'),
  aspectRatio: real('aspect_ratio'),
  dateTaken: text('date_taken'),
  storageKey: text('storage_key'),
  thumbnailKey: text('thumbnail_key'),
  fileSize: integer('file_size'),
  lastModified: text('last_modified'),
  originalUrl: text('original_url'),
  thumbnailUrl: text('thumbnail_url'),
  thumbnailHash: text('thumbnail_hash'),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  exif: text('exif', { mode: 'json' }).$type<NeededExif>(),
  // 地理位置信息
  latitude: real('latitude'),
  longitude: real('longitude'),
  country: text('country'),
  city: text('city'),
  locationName: text('location_name'),
  // LivePhoto 相关字段
  isLivePhoto: integer('is_live_photo').default(0).notNull(),
  livePhotoVideoUrl: text('live_photo_video_url'),
  livePhotoVideoKey: text('live_photo_video_key'),
  // 媒体类型：image 图片 / video 视频
  type: text('type', { enum: ['image', 'video'] })
    .default('image')
    .notNull(),
  // 来源：upload 后台上传 / library 本地目录映射
  source: text('source', { enum: ['upload', 'library'] })
    .default('upload')
    .notNull(),
  // 本地库文件：映射目录 + 目录内相对路径
  libraryMount: text('library_mount'),
  libraryPath: text('library_path'),
})

export const pipelineQueue = sqliteTable('pipeline_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  payload: text('payload', { mode: 'json' })
    .$type<PipelineQueuePayload>()
    .notNull()
    .default({
      type: 'photo',
      storageKey: '',
    } satisfies PipelineQueuePayload),
  priority: integer('priority').default(0).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  status: text('status', {
    enum: [
      'pending', // Waiting to be processed
      'in-stages', // Currently being processed
      'completed', // Successfully processed
      'failed', // Processing failed
    ],
  })
    .notNull()
    .default('pending'),
  statusStage: text('status_stage', {
    enum: [
      'preprocessing',
      'metadata',
      'thumbnail',
      'exif',
      'motion-photo',
      'reverse-geocoding',
      'live-photo',
      'location-erase',
    ],
  }),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

// 照片表态表
export const photoReactions = sqliteTable('photo_reactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  reactionType: text('reaction_type', {
    enum: ['like', 'love', 'amazing', 'funny', 'wow', 'sad', 'fire', 'sparkle'],
  }).notNull(),
  // 使用指纹而不是 IP 地址，更准确且支持匿名用户
  fingerprint: text('fingerprint').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

// 相簿表
export const albums = sqliteTable('albums', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  coverPhotoId: text('cover_photo_id').references(() => photos.id, {
    onDelete: 'set null',
  }),
  isHidden: integer('is_hidden', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

// 相簿-照片 多对多关系表
export const albumPhotos = sqliteTable('album_photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  albumId: integer('album_id')
    .notNull()
    .references(() => albums.id, { onDelete: 'cascade' }),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  position: real('position').notNull().default(1000000),
  addedAt: integer('added_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    namespace: text('namespace').notNull().default('common'),
    key: text('key').notNull(),
    type: text('type', {
      enum: ['string', 'number', 'boolean', 'json'],
    }).notNull(),
    value: text('value'),
    defaultValue: text('default_value'),
    label: text('label'),
    description: text('description'),
    isPublic: integer('is_public', { mode: 'boolean' })
      .default(false)
      .notNull(),
    isReadonly: integer('is_readonly', { mode: 'boolean' })
      .default(false)
      .notNull(),
    isSecret: integer('is_secret', { mode: 'boolean' })
      .default(false)
      .notNull(),
    enum: text('enum', { mode: 'json' }).$type<string[] | null>(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedBy: integer('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [uniqueIndex('idx_namespace_key').on(t.namespace, t.key)],
)

export const settings_storage_providers = sqliteTable(
  'settings_storage_providers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    provider: text('provider', {
      enum: ['s3', 'local', 'openlist'],
    }).notNull(),
    config: text('config', { mode: 'json' }).$type<StorageConfig>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
)

/**
 * 本地扫描库（独立存储方式）：把明文照片/视频放入某一文件夹即被自动扫描、生成缩略图。
 * 与 settings_storage_providers（上传加密 blob 存储后端）完全分离。
 */
export const scanLibraries = sqliteTable('scan_libraries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  /** 扫描的根目录绝对路径（只读源，原图始终引用该目录） */
  rootPath: text('root_path').notNull(),
  provider: text('provider', { enum: ['local'] }).default('local').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
  /** 转为相簿展示：启用后该库以「相簿」形式出现在相册页，并从首页全局画廊隐藏 */
  asAlbum: integer('as_album', { mode: 'boolean' }).default(false).notNull(),
  /** 相簿访问密码（哈希）；为空表示不设密码 */
  passwordHash: text('password_hash'),
  /** 自动监控轮询间隔（毫秒），默认 60s */
  watchIntervalMs: integer('watch_interval_ms').default(60000).notNull(),
  /** 最近一次扫描时间与结果摘要（供状态展示） */
  lastScanAt: integer('last_scan_at', { mode: 'timestamp' }),
  lastScanResult: text('last_scan_result'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})
