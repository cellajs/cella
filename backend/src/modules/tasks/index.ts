import { type SQL, and, eq, gte, ilike, inArray, lte, or } from 'drizzle-orm';
import { db } from '#/db/db';

import type { z } from 'zod';
import { labelsTable } from '#/db/schema/labels';
import { type InsertTaskModel, tasksTable } from '#/db/schema/tasks';
import { usersTable } from '#/db/schema/users';
import { getUsersByConditions } from '#/db/util';
import { getContextUser, getMemberships, getOrganization } from '#/lib/context';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono } from '#/types/common';
import { getOrderColumn } from '#/utils/order-column';
import { splitByAllowance } from '#/utils/split-by-allowance';
import { getDateFromToday, scanTaskDescription } from './helpers';
import taskRoutesConfig from './routes';
import type { subtaskSchema } from './schema';

const app = new CustomHono();

// Task endpoints
const tasksRoutes = app
  /*
   * Create task
   */
  .openapi(taskRoutesConfig.createTask, async (ctx) => {
    const newTaskInfo = ctx.req.valid('json');

    const organization = getOrganization();
    const user = getContextUser();

    // TODO add permission check for project using memberships

    // Use body data to create a new task, add valid organization id
    const newTask: InsertTaskModel = { ...newTaskInfo, organizationId: organization.id };

    const descriptionText = String(newTask.description);

    // Create summary, expandable and keywords from description
    const { summary, expandable, keywords } = scanTaskDescription(descriptionText);
    newTask.summary = summary;
    newTask.expandable = expandable;
    newTask.keywords = keywords;

    const [createdTask] = await db.insert(tasksTable).values(newTask).returning();

    logEvent('Task created', { task: createdTask.id });

    const uniqueAssignedUserIds = [...new Set(createdTask.assignedTo)];
    const assignedTo = await getUsersByConditions([inArray(usersTable.id, uniqueAssignedUserIds)]);
    const labels = await db.select().from(labelsTable).where(inArray(labelsTable.id, createdTask.labels));

    const finalTask = {
      ...createdTask,
      subtasks: [] as z.infer<typeof subtaskSchema>,
      createdBy: user,
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

    const organization = getOrganization();

    // Filter tasks at least by valid organization
    const tasksFilters: SQL[] = [eq(tasksTable.organizationId, organization.id)];

    // Add other filters
    if (projectId) tasksFilters.push(inArray(tasksTable.projectId, projectId.split('_')));
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

    const tasks = await db
      .select()
      .from(tasksQuery.as('tasks'))
      .orderBy(orderColumn)
      .limit(Number(limit))
      .offset(Number(offset))
      // all tasks with status under 6 and with status 6 modified within the last 30 days
      .where(or(lte(tasksTable.status, 5), and(eq(tasksTable.status, 6), gte(tasksTable.modifiedAt, getDateFromToday(30)))));

    // Create a set of unique user IDs from the tasks, so we can retrieve them from the database
    const uniqueAssignedUserIds = Array.from(
      new Set([
        // Get all assigned user IDs by flattening the array of assignedTo properties & filtering null values
        ...tasks.flatMap((t) => t.assignedTo),
        ...tasks.map((t) => t.createdBy).filter((id) => id !== null),
        ...tasks.map((t) => t.modifiedBy).filter((id) => id !== null),
      ]),
    );

    // Create a set of unique label IDs from the tasks
    const uniqueLabelIds = Array.from(new Set([...tasks.flatMap((t) => t.labels)]));

    const users = await getUsersByConditions([inArray(usersTable.id, uniqueAssignedUserIds)]);
    const labels = await db.select().from(labelsTable).where(inArray(labelsTable.id, uniqueLabelIds));

    // Create a map for quick access to users by their ID
    const userMap = new Map(users.map((user) => [user.id, user]));

    const finalTasks = tasks
      .map((task) => {
        const subtasks = tasks.filter((st) => st.parentId === task.id).sort((a, b) => a.order - b.order);

        return {
          ...task,
          subtasks: subtasks,
          createdBy: task.createdBy ? userMap.get(task.createdBy) || null : null,
          modifiedBy: userMap.get(task.modifiedBy || '') || null,
          assignedTo: users.filter((m) => task.assignedTo.includes(m.id)),
          labels: labels.filter((m) => task.labels.includes(m.id)),
        };
      })
      .filter((task) => !task.parentId); // Filter out subtasks

    return ctx.json({ success: true, data: { items: finalTasks, total: finalTasks.length } }, 200);
  })
  /*
   * Update task
   */
  .openapi(taskRoutesConfig.updateTask, async (ctx) => {
    const id = ctx.req.param('id');
    const { key, data, order } = ctx.req.valid('json');

    const allowedKeys = ['labels', 'assignedTo', 'type', 'status', 'description', 'impact'];

    // Validate request
    if (!id) return errorResponse(ctx, 404, 'not_found', 'warn');
    if (!allowedKeys.includes(key)) return errorResponse(ctx, 400, 'invalid_request', 'warn', 'task');

    const user = getContextUser();

    // TODO add permission check for project using memberships

    const updateValues: Partial<InsertTaskModel> = {
      [key]: data,
      modifiedAt: new Date(),
      modifiedBy: user.id,
      ...(order && { order: order }),
    };

    // If updating description, also update keywords, summary and expandable
    if (key === 'description' && data) {
      const descriptionText = String(data);

      const { summary, expandable, keywords } = scanTaskDescription(descriptionText);
      updateValues.summary = summary;
      updateValues.expandable = expandable;
      updateValues.keywords = keywords;
    }

    const [updatedTask] = await db.update(tasksTable).set(updateValues).where(eq(tasksTable.id, id)).returning({
      summary: tasksTable.summary,
      description: tasksTable.description,
      expandable: tasksTable.expandable,
      order: tasksTable.order,
    });

    return ctx.json({ success: true, data: updatedTask }, 200);
  })
  /*
   * Delete tasks
   */
  .openapi(taskRoutesConfig.deleteTasks, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const memberships = getMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];

    if (!toDeleteIds.length) return errorResponse(ctx, 400, 'invalid_request', 'warn', 'task');

    const { allowedIds, disallowedIds } = await splitByAllowance('delete', 'task', toDeleteIds, memberships);
    if (!allowedIds.length) return errorResponse(ctx, 403, 'forbidden', 'warn', 'task');

    // Map errors of tasks user is not allowed to delete
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'task', { project: id }));

    // Delete subtasks at first then delete the tasks
    await db.delete(tasksTable).where(inArray(tasksTable.parentId, allowedIds));
    await db.delete(tasksTable).where(inArray(tasksTable.id, allowedIds));

    return ctx.json({ success: true, errors: errors }, 200);
  });

export default tasksRoutes;
