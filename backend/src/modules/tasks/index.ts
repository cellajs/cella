import { type SQL, and, eq, gt, ilike, inArray, lt, asc, desc } from 'drizzle-orm';
import { db } from '../../db/db';

import { getOrderColumn } from '../../lib/order-column';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import taskRoutesConfig from './routes';
import { tasksTable } from '../../db/schema/tasks';
import { errorResponse } from '../../lib/errors';
import { usersTable } from '../../db/schema/users';
import { labelsTable } from '../../db/schema/labels';
import { transformDatabaseUser } from '../users/helpers/transform-database-user';

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

    const uniqueAssignedUserIds = Array.from(
      new Set([
        ...tasks.flatMap((t) => t.assignedTo),
        ...tasks.map((t) => t.createdBy),
        ...tasks.map((t) => t.modifiedBy).filter((id) => id !== null),
      ]),
    );
    const uniqueLabelIds = Array.from(new Set([...tasks.flatMap((t) => t.labels)]));

    const users = (await db.select().from(usersTable).where(inArray(usersTable.id, uniqueAssignedUserIds))).map((user) =>
      transformDatabaseUser(user),
    );

    const labels = await db.select().from(labelsTable).where(inArray(labelsTable.id, uniqueLabelIds));

    const tasksWithSubtasks = tasks.map((task) => ({
      ...task,
      subTasks: tasks.filter((st) => st.parentId === task.id).sort((a, b) => a.order - b.order),
    }));

    const finalTasks = tasksWithSubtasks.map((task) => ({
      ...task,
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      createdBy: users.find((m) => m.id === task.createdBy)!,
      modifiedBy: users.find((m) => m.id === task.modifiedBy) || null,
      assignedTo: users.filter((m) => task.assignedTo.includes(m.id)),
      labels: labels.filter((m) => task.labels.includes(m.id)),
    }));

    return ctx.json(
      {
        success: true,
        data: {
          items: finalTasks,
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
   * Get  relative task order by main task id
   */
  .openapi(taskRoutesConfig.getRelativeTaskOrder, async (ctx) => {
    const { edge, currentOrder, sourceId, projectId, reversed } = ctx.req.valid('json');

    const filter = [eq(tasksTable.projectId, projectId)];
    filter.push(edge === 'top' ? gt(tasksTable.order, currentOrder) : lt(tasksTable.order, currentOrder));

    const controlEdge = reversed ? 'bottom' : 'top';

    const [relativeTask] = await db
      .select()
      .from(tasksTable)
      .where(and(...filter))
      .orderBy(edge === controlEdge ? asc(tasksTable.order) : desc(tasksTable.order));

    let newOrder: number;

    if (!relativeTask || relativeTask.order === currentOrder) {
      if (reversed) newOrder = edge === 'top' ? currentOrder / 2 : currentOrder + 1;
      else newOrder = edge === 'top' ? currentOrder + 1 : currentOrder / 2;
    } else if (relativeTask.id === sourceId) {
      newOrder = relativeTask.order;
    } else {
      newOrder = (relativeTask.order + currentOrder) / 2;
    }

    return ctx.json(
      {
        success: true,
        data: newOrder,
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

    const subTasks = await db.select().from(tasksTable).where(eq(tasksTable.parentId, updatedTask.id));

    const uniqueAssignedUserIds = Array.from(new Set([...updatedTask.assignedTo, updatedTask.createdBy]));
    if (updatedTask.modifiedBy) uniqueAssignedUserIds.push(updatedTask.modifiedBy);
    const users = (await db.select().from(usersTable).where(inArray(usersTable.id, uniqueAssignedUserIds))).map((user) =>
      transformDatabaseUser(user),
    );
    const labels = await db.select().from(labelsTable).where(inArray(labelsTable.id, updatedTask.labels));

    const finalTask = {
      subTasks,
      ...updatedTask,
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      createdBy: users.find((m) => m.id === updatedTask.createdBy)!,
      modifiedBy: users.find((m) => m.id === updatedTask.modifiedBy) || null,
      assignedTo: users.filter((m) => updatedTask.assignedTo.includes(m.id)),
      labels: labels.filter((m) => updatedTask.labels.includes(m.id)),
    };

    return ctx.json(
      {
        success: true,
        data: finalTask,
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
