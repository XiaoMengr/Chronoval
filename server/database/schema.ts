import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
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
  // 两次验证（TOTP）：secret 在开启前先生成并暂存，用户用验证器扫码确认后才置 enabled
  totpSecret: text('totp_secret'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' })
    .default(false)
    .notNull(),
})

// 登入记录：记录每次登入尝试（成功/失败/待两步验证），用于账户安全审计。
// userId 对未知账户（登录邮箱不存在）为 null，此时以 email 留存失败足迹。
export const loginLogs = sqliteTable(
  'login_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // 关联用户；登入邮箱不存在时（失败尝试）为 null
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    // 尝试登入的邮箱（冗余保存，便于未知账户失败记录定位）
    email: text('email').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    // IP 归属地（离线库解析，失败/内网为 null）
    country: text('country'),
    region: text('region'),
    city: text('city'),
    // 认证途径：password 邮箱密码 / two-factor 两步验证 / github OAuth
    method: text('method', {
      enum: ['password', 'two-factor', 'github'],
    })
      .default('password')
      .notNull(),
    // 结果：challenge=密码正确但需两步验证（待验证）
    status: text('status', {
      enum: ['success', 'failed', 'challenge'],
    }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index('idx_login_logs_user_created').on(table.userId, table.createdAt),
    index('idx_login_logs_email_created').on(table.email, table.createdAt),
  ],
)

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
  // 360 全景手动标记：null=自动判定；1=强制全景；0=强制非全景
  isPanorama: integer('is_panorama'),
  // 360 全景固定初始视角（度）：null=不固定；前台打开全景时按该视角进入
  panoYaw: real('pano_yaw'),
  panoPitch: real('pano_pitch'),
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
  // 回收站软删除标记：null=正常；非 null=已移入回收站（该时间戳即删除时刻）
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
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
  // 首页照片画廊展示开关（仅普通相簿）：开启后该相簿的照片不进入首页全局照片流
  hideFromGallery: integer('hide_from_gallery', { mode: 'boolean' }).default(false).notNull(),
  // 相簿访问密码哈希（单向存储）；null=未设置密码（开放）
  passwordHash: text('password_hash'),
  // 相簿访问密码明文（仅管理端编辑回显；访问验证仍以 password_hash 为准）
  password: text('password'),
  // 相簿公开标识（不透明 UID，替代自增 id 暴露在公网链接中）；
  // 惰性生成：存量相簿首次返回时自动补全并落库。
  uid: text('uid'),
  // 自定义公开URL别名（全局唯一）；设置后公开链接使用 /albums/s/{slug}
  slug: text('slug'),
  // 照片展示布局：瀑布流 / 统一网格 / 沉浸式看图 / 时间线；null 视为默认（瀑布流）
  layout: text('layout', { enum: ['waterfall', 'grid', 'immersive', 'timeline'] })
    .default('waterfall')
    .notNull(),
  // 「随机一张照片」是否使用 3D 轮盘动画（样式功能）；false=直接随机打开一张照片
  randomWheelAnimation: integer('random_wheel_animation', { mode: 'boolean' })
    .default(false)
    .notNull(),
  // 「随机一张照片」动画模式：default=直接随机打开；wheel=3D轮盘动画；compat=轻量兼容动画
  randomAnimation: text('random_animation', {
    enum: ['default', 'wheel', 'compat'],
  })
    .default('default')
    .notNull(),
  // 「随机照片轮经典语录」扩展功能：是否开启（扩展功能，默认开启，可在相簿编辑「扩展」中关闭）
  randomQuotesEnabled: integer('random_quotes_enabled', { mode: 'boolean' })
    .default(true)
    .notNull(),
  // 自定义语录（每行一条）；空=使用内置语录
  randomQuotes: text('random_quotes'),
  // 「随机照片轮经典语录」标签来源：ancient=古诗语录 / modern=现代语录；null=未选（使用自定义语录）
  randomQuotesTag: text('random_quotes_tag', {
    enum: ['ancient', 'modern'],
  }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => [
  // uid 是公开标识，须全局唯一；slug 是自定义URL别名，亦须全局唯一
  uniqueIndex('albums_uid_unique').on(table.uid),
  uniqueIndex('albums_slug_unique').on(table.slug),
])

// 相簿-照片 多对多关系表
export const albumPhotos = sqliteTable(
  'album_photos',
  {
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
  },
  // 同一照片在同一相簿中只能出现一次；同时让 onConflictDoNothing 真正生效，
  // 也从根源上杜绝相簿照片重复（此前无唯一约束，历史脏数据可能产生重复行）。
  (table) => [uniqueIndex('album_photos_album_photo_unique').on(table.albumId, table.photoId)],
)

// 扫描库=相簿 的自定义元数据覆盖表。
// 外部库文件夹作为相簿时其标题/介绍等默认由文件结构推导；管理端可通过此表保存
// 覆盖值（自定义标题、介绍、封面、隐藏、自定义URL）。主键为 挂载名+相对路径。
export const scanAlbumMeta = sqliteTable(
  'scan_album_meta',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // 扫描库挂载名（如 scan-{libId}）
    mount: text('mount').notNull(),
    // 目录相对路径：'' 表示库根（主相簿）；子目录为 'sub/dir'
    relPath: text('rel_path').notNull().default(''),
    // 自定义标题（覆盖默认由文件夹名推导的标题）；null=使用默认
    title: text('title'),
    description: text('description'),
    coverPhotoId: text('cover_photo_id').references(() => photos.id, {
      onDelete: 'set null',
    }),
    // 是否在前台相册列表隐藏（默认false）
    isHidden: integer('is_hidden', { mode: 'boolean' }).default(false).notNull(),
    // 相簿访问密码哈希（单向存储）；null=继承父级；根相簿无值时回退到扫描库旧密码
    passwordHash: text('password_hash'),
    // 相簿访问密码明文（仅管理端编辑回显；访问验证仍以 password_hash 为准）
    password: text('password'),
    // 自定义公开URL别名（全局唯一）；设置后公开链接使用 /albums/s/{slug}
    slug: text('slug'),
    // 相簿自身的公开 URL 标识（随机生成、全局唯一）：设置后该相簿（含子目录）使用
    // /albums/scan/{urlKey} 访问。与扫描库级 urlKey 分离，可被管理员手动重置；
    // 不参与库级 backfill（那些仅针对 scan_libraries.url_key）。
    urlKey: text('url_key'),
    // 照片展示布局：瀑布流 / 统一网格 / 沉浸式看图 / 时间线；null 视为默认（瀑布流）
    layout: text('layout', { enum: ['waterfall', 'grid', 'immersive', 'timeline'] })
      .default('waterfall')
      .notNull(),
    randomWheelAnimation: integer('random_wheel_animation', { mode: 'boolean' })
      .default(false)
      .notNull(),
    // 「随机一张照片」动画模式：default=直接随机打开；wheel=3D轮盘动画；compat=轻量兼容动画
    randomAnimation: text('random_animation', {
      enum: ['default', 'wheel', 'compat'],
    })
      .default('default')
      .notNull(),
    // 「随机照片轮经典语录」扩展功能：是否开启（默认开启）
    randomQuotesEnabled: integer('random_quotes_enabled', { mode: 'boolean' })
      .default(true)
      .notNull(),
    // 自定义语录（每行一条）；空=使用内置语录
    randomQuotes: text('random_quotes'),
    // 「随机照片轮经典语录」标签来源：ancient=古诗语录 / modern=现代语录；null=未选（使用自定义语录）
    randomQuotesTag: text('random_quotes_tag', {
      enum: ['ancient', 'modern'],
    }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    mountRelPathUnique: uniqueIndex('scan_album_meta_mount_relpath_unique').on(
      table.mount,
      table.relPath,
    ),
    slugUnique: uniqueIndex('scan_album_meta_slug_unique').on(table.slug),
    albumUrlKeyUnique: uniqueIndex('scan_album_meta_url_key_unique').on(
      table.urlKey,
    ),
  }),
)

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
export const scanLibraries = sqliteTable(
  'scan_libraries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    /**
     * 公开相簿 URL 标识：sha256 短前缀（形如 a1b2c3d4，类似 git 提交 hash）；
     * 自动生成并做去重检测。为空时回退到数字 id。自定义 slug（scan_album_meta.slug）
     * 优先级更高，相簿公开链接使用 /albums/s/{slug}。
     */
    urlKey: text('url_key'),
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
  /**
   * 最近一次被禁用的时间；为空表示当前为启用状态或从未被禁用。
   * 用于「禁用超 7 天未恢复则自动清理其缩略图」的恢复缓冲判断。
   */
  disabledAt: integer('disabled_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  },
  (table) => [uniqueIndex('scan_libraries_url_key_unique').on(table.urlKey)],
)
