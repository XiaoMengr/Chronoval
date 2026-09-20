import { z } from 'zod'
import { scanMountName } from '~~/server/services/scan-library/manager'
import {
  upsertScanAlbumMeta,
  clearScanAlbumMeta,
} from '~~/server/services/scan-library/album-meta'
import { hashAlbumPassword } from '~~/server/utils/scanAlbumPassword'

/**
 * 新增/更新/清除某扫描库相簿（或其二级子相簿）的元数据。
 * 仅管理员可访问。用于外部库相簿的标题、介绍、封面、隐藏、自定义URL 编辑。
 */
export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readValidatedBody(
    event,
    z.object({
      libId: z.number().int().positive(),
      // 目录相对路径：'' 表示库根（主相簿）
      path: z.string().default(''),
      title: z.string().max(255).nullable().optional(),
      description: z.string().max(1000).nullable().optional(),
      coverPhotoId: z.string().nullable().optional(),
      isHidden: z.boolean().optional(),
      // 相簿访问密码：非空明文 → 设置新密码；配合 clearPassword=true → 清除密码；否则保持不变
      password: z.string().max(128).optional(),
      clearPassword: z.boolean().optional(),
      slug: z
        .string()
        .max(120)
        .nullable()
        .optional()
        .transform((v) => (v ? v.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') : v)),
      // 照片展示布局：瀑布流 / 统一网格 / 沉浸式看图
      layout: z.enum(['waterfall', 'grid', 'immersive', 'timeline']).optional(),
      // 「随机一张照片」动画模式：default=直接打开 / wheel=3D轮盘 / compat=兼容动画
      randomAnimation: z.enum(['default', 'wheel', 'compat']).optional(),
      // 「随机一张照片」是否使用 3D 轮盘动画（旧字段，兼容旧客户端）
      randomWheelAnimation: z.boolean().optional(),
      // 「随机照片轮经典语录」扩展功能是否开启
      randomQuotesEnabled: z.boolean().optional(),
      // 自定义语录（每行一条）；空=使用内置语录
      randomQuotes: z.string().max(5000).nullable().optional(),
      // 「随机照片轮经典语录」标签来源：ancient=古诗语录 / modern=现代语录；null=未选（使用自定义）
      randomQuotesTag: z.enum(['ancient', 'modern']).nullable().optional(),
      // 传 true 时清除该相簿的元数据（还原为默认推导值）
      clear: z.boolean().optional(),
    }).parse,
  )

  const mount = scanMountName(body.libId)

  if (body.clear) {
    await clearScanAlbumMeta(mount, body.path)
    return { success: true, cleared: true }
  }

  // 密码处理：未修改字段时不清除原有密码；password（明文）与 passwordHash 同步维护（明文仅供管理端回显）
  let passwordHash: string | null | undefined
  let password: string | null | undefined
  if (body.clearPassword) {
    passwordHash = null
    password = null
  } else if (body.password && body.password.trim()) {
    const plain = body.password.trim()
    passwordHash = hashAlbumPassword(plain)
    password = plain
  }

  const meta = await upsertScanAlbumMeta({
    mount,
    relPath: body.path,
    title: body.title,
    description: body.description,
    coverPhotoId: body.coverPhotoId,
    isHidden: body.isHidden,
    passwordHash,
    password,
    slug: body.slug,
    layout: body.layout,
    randomWheelAnimation: body.randomWheelAnimation,
    randomAnimation: body.randomAnimation,
    randomQuotesEnabled: body.randomQuotesEnabled,
    randomQuotes: body.randomQuotes,
    randomQuotesTag: body.randomQuotesTag,
  })

  return {
    success: true,
    meta: {
      mount: meta.mount,
      relPath: meta.relPath,
      title: meta.title,
      description: meta.description,
      coverPhotoId: meta.coverPhotoId,
      isHidden: meta.isHidden,
      passwordProtected: Boolean(meta.passwordHash),
      slug: meta.slug,
      layout: meta.layout,
      randomWheelAnimation: meta.randomWheelAnimation,
      randomAnimation: meta.randomAnimation,
      randomQuotesEnabled: meta.randomQuotesEnabled,
      randomQuotes: meta.randomQuotes,
      randomQuotesTag: meta.randomQuotesTag,
    },
  }
})