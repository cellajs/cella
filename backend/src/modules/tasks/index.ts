import { type SQL, and, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '#/db/db';

import { parse as parseHtml } from 'node-html-parser';
import type { z } from 'zod';
import { labelsTable } from '#/db/schema/labels';
import { type InsertTaskModel, tasksTable } from '#/db/schema/tasks';
import { usersTable } from '#/db/schema/users';
import { getUsersByConditions } from '#/db/util';
import { errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono } from '#/types/common';
import { getOrderColumn } from '#/utils/order-column';
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
    const assignedTo = await getUsersByConditions([inArray(usersTable.id, uniqueAssignedUserIds)]);
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
    const { q, sort, order, offset, limit, projectId, status } = ctx.req.valid('query');

    const tasksFilters: SQL[] = [inArray(tasksTable.projectId, projectId.split('_'))];
    if (q) tasksFilters.push(ilike(tasksTable.keywords, `%${q}%`));
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
      sort,
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

    const users = await getUsersByConditions([inArray(usersTable.id, uniqueAssignedUserIds)]);

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
   * Update task
   */
  .openapi(taskRoutesConfig.updateTask, async (ctx) => {
    const id = ctx.req.param('id');
    if (!id) return errorResponse(ctx, 404, 'not_found', 'warn');
    const user = ctx.get('user');
    const { key, data, order } = ctx.req.valid('json');

    const updateValues: Partial<InsertTaskModel> = {
      [key]: data,
      modifiedAt: new Date(),
      modifiedBy: user.id,
      ...(order && { order: order }),
    };

    if (key === 'description' && data) {
      const descriptionText = String(data);
      const rootElement = parseHtml(descriptionText);
      const groupElement = rootElement.querySelector('.bn-block-group');
      if (groupElement) {
        // Remove all child element except the first one
        const children = groupElement.childNodes;
        for (let i = 1; i < children.length; i++) {
          groupElement.removeChild(children[i]);
        }
        const summaryText = rootElement.toString();
        updateValues.summary = summaryText;

        if (descriptionText.length === summaryText.length) {
          updateValues.expandable = summaryText !== descriptionText;
        } else {
          updateValues.expandable = true;
        }
      }
    }

    const [updatedTask] = await db.update(tasksTable).set(updateValues).where(eq(tasksTable.id, id)).returning();

    const subTasks = await db.select().from(tasksTable).where(eq(tasksTable.parentId, updatedTask.id));

    const uniqueAssignedUserIds = Array.from(new Set([...updatedTask.assignedTo, updatedTask.createdBy]));
    if (updatedTask.modifiedBy) uniqueAssignedUserIds.push(updatedTask.modifiedBy);
    const users = await getUsersByConditions([inArray(usersTable.id, uniqueAssignedUserIds)]);
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
