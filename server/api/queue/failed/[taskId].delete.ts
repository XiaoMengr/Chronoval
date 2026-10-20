import { z } from 'zod'
import { eq } from 'drizzle-orm'

/**
 * 删除单个失败任务（/queue 任务列表「删除」按钮）。
 * 用于清理无法修复的死任务（如永久损坏的外部库文件），避免列表堆积。
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  try {
    const { taskId } = await getValidatedRouterParams(
      event,
      z.object({ taskId: z.string().transform((v) => parseInt(v, 10)) }).parse,
    )

    const db = useDB()

    const task = await db
      .select()
      .from(tables.pipelineQueue)
      .where(eq(tables.pipelineQueue.id, taskId))
      .get()

    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found',
      })
    }

    // 仅允许删除已失败的任务（进行中/等待中的任务先等其结束或走清理接口）
    if (task.status !== 'failed') {
      throw createError({
        statusCode: 400,
        statusMessage: `Task is not in failed status, current status: ${task.status}`,
      })
    }

    await db
      .delete(tables.pipelineQueue)
      .where(eq(tables.pipelineQueue.id, taskId))
      .run()

    return {
      success: true,
      message: `Task ${taskId} deleted`,
      taskId,
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Failed to delete task:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete task',
    })
  }
})
