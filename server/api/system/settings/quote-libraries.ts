import { z } from 'zod'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import { QUOTE_LIBRARIES_SETTING_KEY } from '~~/server/services/settings/quoteLibraries'
import { getQuoteLibraries } from '~~/server/services/settings/quoteLibraries'
import { useDB, tables, eq } from '~~/server/utils/db'

/**
 * GET/PUT /api/system/settings/quote-libraries
 *
 * 「随机照片轮经典语录」语录库（古诗/现代）：
 * - GET：返回两个标签各自的语录数组 + 条数（管理员与登录用户均可读，用于后台表单展示条数）。
 * - PUT：管理员整体保存两个标签的语录（空数组或缺失项回退内置默认）。
 */
export default eventHandler(async (event) => {
  if (event.method === 'GET') {
    const libs = await getQuoteLibraries()
    return {
      libraries: {
        ancient: libs.ancient,
        modern: libs.modern,
      },
    }
  }

  if (event.method === 'PUT') {
    const session = await requireUserSession(event)
    if (!session || !session.user.isAdmin) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Admin privileges required',
      })
    }

    const body = await readValidatedBody(
      event,
      z.object({
        libraries: z.object({
          ancient: z.array(z.string().trim().min(1).max(200)).max(500),
          modern: z.array(z.string().trim().min(1).max(200)).max(500),
        }),
      }).parse,
    )

    const db = useDB()
    const currentUser = session.user.id
      ? db
          .select()
          .from(tables.users)
          .where(eq(tables.users.id, session.user.id))
          .get()
      : null
    const updatedBy = currentUser ? currentUser.id : undefined

    await settingsManager.set(
      'system',
      QUOTE_LIBRARIES_SETTING_KEY,
      {
        ancient: body.libraries.ancient,
        modern: body.libraries.modern,
      },
      updatedBy,
    )

    const libs = await getQuoteLibraries()
    return {
      libraries: {
        ancient: libs.ancient,
        modern: libs.modern,
      },
    }
  }

  throw createError({ statusCode: 405 })
})