import { type SQL, and, eq, gt, ilike, inArray, lt, asc, desc } from 'drizzle-orm';
import { db } from '../../db/db';

import { getOrderColumn } from '../../lib/order-column';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import taskRoutesConfig from './routes';
import { tasksTable } from '../../db/schema/tasks';
import { errorResponse } from '../../lib/errors';

const app = new CustomHono();

// Task endpoints
const tasksRoutes = app
  /*
   * Create task
   */
  .openapi(taskRoutesConfig.createTask, async (ctx) => {
    const newTask = ctx.req.valid('json');

    await db.insert(tasksTable).values(newTask).returning();

    logEvent('Tasks created', { task: newTask.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Get list of tasks
   */
  .openapi(taskRoutesConfig.getTasks, async (ctx) => {
    const { q, tableSort, order, offset, limit, projectId, status } = ctx.req.valid('query');

    const tasksFilters: SQL[] = [inArray(tasksTable.projectId, projectId.split('_'))];
    if (q) tasksFilters.push(ilike(tasksTable.description, `%${q}%`));
    if (status) tasksFilters.push(inArray(tasksTable.status, status.split('_').map(Number)));

    const tasksQuery = db
      .select()
      .from(tasksTable)
      .where(and(...tasksFilters));

    const orderColumn = getOrderColumn(
      {
        type: tasksTable.type,
        status: tasksTable.status,
        projectId: tasksTable.projectId,
        createdAt: tasksTable.createdAt,
        createdBy: tasksTable.createdBy,
        modifiedAt: tasksTable.modifiedAt,
      },
      tableSort,
      tasksTable.createdAt,
      order,
    );

    const tasks = await db.select().from(tasksQuery.as('tasks')).orderBy(orderColumn).limit(Number(limit)).offset(Number(offset));

    return ctx.json(
      {
        success: true,
        data: {
          items: tasks,
          total: tasks.length,
        },
      },
      200,
    );
  })
  /*
   * Get task by id
   */
  .openapi(taskRoutesConfig.getTask, async (ctx) => {
    const id = ctx.req.param('id');
    if (!id) return errorResponse(ctx, 404, 'not_found', 'warn');

    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));

    return ctx.json(
      {
        success: true,
        data: task,
      },
      200,
    );
  })
  /*
   * Get  relative task by main task id
   */
  .openapi(taskRoutesConfig.getRelativeTask, async (ctx) => {
    const { edge, currentOrder, projectId, reversed } = ctx.req.valid('json');

    const filter = [eq(tasksTable.projectId, projectId)];
    filter.push(edge === 'top' ? gt(tasksTable.order, currentOrder) : lt(tasksTable.order, currentOrder));

    const controlEdge = reversed ? 'bottom' : 'top';

    const [relativeTask] = await db
      .select()
      .from(tasksTable)
      .where(and(...filter))
      .orderBy(edge === controlEdge ? asc(tasksTable.order) : desc(tasksTable.order));

    return ctx.json(
      {
        success: true,
        data: relativeTask,
      },
      200,
    );
  })

  /*
   * Update task by id
   */
  .openapi(taskRoutesConfig.updateTask, async (ctx) => {
    const id = ctx.req.param('id');
    if (!id) return errorResponse(ctx, 404, 'not_found', 'warn');
    const user = ctx.get('user');
    const { key, data, order } = ctx.req.valid('json');

    await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    const [updatedTask] = await db
      .update(tasksTable)
      .set({
        [key]: data,
        modifiedAt: new Date(),
        modifiedBy: user.id,
        ...(order && { order: order }),
      })
      .where(eq(tasksTable.id, id))
      .returning();

    return ctx.json(
      {
        success: true,
        data: updatedTask,
      },
      200,
    );
  })
  /*
   * Delete tasks
   */
  .openapi(taskRoutesConfig.deleteTasks, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const idsArray = Array.isArray(ids) ? ids : [ids];
    // Delete subTasks at first then delete the tasks
    await db.delete(tasksTable).where(inArray(tasksTable.parentId, idsArray));
    await db.delete(tasksTable).where(inArray(tasksTable.id, idsArray));

    return ctx.json({ success: true }, 200);
  });

export default tasksRoutes;
