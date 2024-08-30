import { type SQL, and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { db } from '../../db/db';

import type { z } from 'zod';
import { labelsTable } from '../../db/schema/labels';
import { tasksTable } from '../../db/schema/tasks';
import { usersTable } from '../../db/schema/users';
import { errorResponse } from '../../lib/errors';
import { getOrderColumn } from '../../lib/order-column';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { transformDatabaseUser } from '../users/helpers/transform-database-user';
import taskRoutesConfig from './routes';
import type { subTaskSchema } from './schema';

const app = new CustomHono();

// Task endpoints
const tasksRoutes = app
  /*
   * Create task
   */
  .openapi(taskRoutesConfig.createTask, async (ctx) => {
    const newTask = ctx.req.valid('json');
    const user = ctx.get('user');
    const [createdTask] = await db.insert(tasksTable).values(newTask).returning();

    logEvent('Task created', { task: newTask.id });

    const uniqueAssignedUserIds = [...new Set(createdTask.assignedTo)];
    const assignedTo = (await db.select().from(usersTable).where(inArray(usersTable.id, uniqueAssignedUserIds))).map((user) =>
      transformDatabaseUser(user),
    );
    const labels = await db.select().from(labelsTable).where(inArray(labelsTable.id, createdTask.labels));

    const finalTask = {
      ...createdTask,
      subTasks: [] as z.infer<typeof subTaskSchema>,
      createdBy: transformDatabaseUser(user),
      modifiedBy: null,
      assignedTo: assignedTo.filter((m) => createdTask.assignedTo.includes(m.id)),
      labels: labels.filter((m) => createdTask.labels.includes(m.id)),
    };

    return ctx.json({ success: true, data: finalTask }, 200);
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

    const tasksWithSubtasks = tasks
      .filter((t) => !t.parentId)
      .map((task) => ({
        ...task,
        subTasks: tasks.filter((st) => st.parentId === task.id).sort((a, b) => a.order - b.order),
      }));

    const finalTasks = tasksWithSubtasks.map((task) => ({
      ...task,
      createdBy: users.find((m) => m.id === task.createdBy) || null,
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
   * Get new task order on status change
   */
  .openapi(taskRoutesConfig.getNewTaskOrder, async (ctx) => {
    const { oldStatus, newStatus, projectId } = ctx.req.valid('query');

    const direction = +newStatus - +oldStatus;

    const [task] = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.status, Number(newStatus)), isNull(tasksTable.parentId)))
      .orderBy(direction > 0 ? asc(tasksTable.order) : desc(tasksTable.order));

    const newOrder = task ? (direction > 0 ? task.order / 2 : task.order + 1) : 1;

    return ctx.json(
      {
        success: true,
        data: newOrder,
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
   * Get first task of the project by project id
   */
  .openapi(taskRoutesConfig.getTaskByProjectId, async (ctx) => {
    const id = ctx.req.param('id');
    const { showAccepted } = ctx.req.valid('query');
    if (!id) return errorResponse(ctx, 400, 'not_found', 'warn');

    const filters = [eq(tasksTable.projectId, id), isNull(tasksTable.parentId), gte(tasksTable.modifiedAt, sql`NOW() - INTERVAL '30 DAYS'`)];
    if (showAccepted !== 'true') filters.push(ne(tasksTable.status, 6));
    const [task] = await db
      .select()
      .from(tasksTable)
      .where(and(...filters))
      .orderBy(desc(tasksTable.status), desc(tasksTable.order))
      .limit(1);

    return ctx.json(
      {
        success: true,
        data: task,
      },
      200,
    );
  })
  /*
   * Get relative task order
   */
  .openapi(taskRoutesConfig.getRelativeTaskOrder, async (ctx) => {
    const { edge, currentOrder, sourceId, projectId, status, parentId } = ctx.req.valid('json');

    const filter = [eq(tasksTable.projectId, projectId)];
    if (status) filter.push(eq(tasksTable.status, status));
    if (parentId) {
      filter.push(eq(tasksTable.parentId, parentId));
      filter.push(edge === 'top' ? lt(tasksTable.order, currentOrder) : gt(tasksTable.order, currentOrder));
    } else filter.push(edge === 'top' ? gt(tasksTable.order, currentOrder) : lt(tasksTable.order, currentOrder));

    const controlEdge = parentId ? 'bottom' : 'top';

    const [relativeTask] = await db
      .select()
      .from(tasksTable)
      .where(and(...filter))
      .orderBy(edge === controlEdge ? asc(tasksTable.order) : desc(tasksTable.order))
      .limit(1);

    let newOrder: number;

    if (!relativeTask || relativeTask.order === currentOrder) {
      if (parentId) newOrder = edge === 'top' ? currentOrder / 2 : currentOrder + 1;
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
   * Update task
   */
  .openapi(taskRoutesConfig.updateTask, async (ctx) => {
    const id = ctx.req.param('id');
    if (!id) return errorResponse(ctx, 404, 'not_found', 'warn');
    const user = ctx.get('user');
    const { key, data, order } = ctx.req.valid('json');

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
      createdBy: users.find((m) => m.id === updatedTask.createdBy) || null,
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
