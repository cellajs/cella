import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { tasksTable } from '#/db/schema/tasks';
import { paginationQuerySchema } from '#/utils/schema/common-schemas';
import { labelSchema } from '../labels/schema';
import { userSchema } from '../users/schema';

export const createTaskSchema = z.object({
  ...createSelectSchema(tasksTable).omit({
    labels: true,
    entity: true,
    assignedTo: true,
    modifiedAt: true,
    modifiedBy: true,
    parentId: true,
    createdAt: true,
  }).shape,
  labels: z.array(z.string()).optional(),
  assignedTo: z.array(z.string()).optional(),
  parentId: z.string().optional(),
});

export const updateTaskSchema = z.object({
  key: z.string(),
  data: z.union([z.array(z.string()), z.string(), z.number(), z.boolean()]).nullable(),
  order: z.number().nullable(),
});

export const simpleTaskSchema = z.object({
  ...createSelectSchema(tasksTable).omit({
    labels: true,
    assignedTo: true,
    modifiedAt: true,
    createdAt: true,
  }).shape,
  labels: z.array(z.string()).optional(),
  assignedTo: z.array(z.string()).optional(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
});

const taskSchema = z.object({
  ...createSelectSchema(tasksTable).omit({
    labels: true,
    createdBy: true,
    assignedTo: true,
    modifiedAt: true,
    modifiedBy: true,
    parentId: true,
    createdAt: true,
  }).shape,
  labels: z.array(labelSchema),
  assignedTo: z.array(userSchema.omit({ counts: true })),
  createdAt: z.string(),
  parentId: z.string().nullable(),
  modifiedAt: z.string().nullable(),
  createdBy: userSchema.omit({ counts: true }).nullable(),
  modifiedBy: userSchema.omit({ counts: true }).nullable(),
});

export const subTaskSchema = z.array(
  z.object({
    ...createSelectSchema(tasksTable).pick({
      id: true,
      description: true,
      summary: true,
      expandable: true,
      status: true,
      order: true,
      projectId: true,
      parentId: true,
      entity: true,
      organizationId: true,
    }).shape,
  }),
);

export const fullTaskSchema = z.object({
  ...taskSchema.shape,
  subTasks: subTaskSchema,
});

export const getTasksQuerySchema = paginationQuerySchema.merge(
  z.object({
    q: z.string().optional(),
    sort: z.enum(['projectId', 'status', 'createdBy', 'type', 'modifiedAt', 'createdAt']).default('createdAt').optional(),
    order: z.enum(['asc', 'desc']).default('asc').optional(),
    projectId: z.string(),
    status: z.string().optional(),
  }),
);
