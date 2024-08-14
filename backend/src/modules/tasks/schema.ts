import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { idSchema, paginationQuerySchema } from '../../lib/common-schemas';
import { tasksTable } from '../../db/schema/tasks';
import { userSchema } from '../users/schema';
import { labelsTable } from '../../db/schema/labels';

export const createTaskSchema = z.object({
  ...createSelectSchema(tasksTable).omit({ labels: true, assignedTo: true, modifiedAt: true, modifiedBy: true, parentId: true, createdAt: true })
    .shape,
  labels: z.array(z.string()).optional(),
  assignedTo: z.array(z.string()).optional(),
  parentId: z.string().optional(),
});

export const updateTaskSchema = z.object({
  key: z.string(),
  data: z.union([z.array(z.string()), z.string(), z.number()]).nullable(),
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
  labels: z.array(z.object({ ...createSelectSchema(labelsTable).shape })),
  assignedTo: z.array(userSchema.omit({ counts: true })),
  createdAt: z.string(),
  parentId: z.string().nullable(),
  modifiedAt: z.string().nullable(),
  createdBy: userSchema.omit({ counts: true }),
  modifiedBy: userSchema.omit({ counts: true }).nullable(),
});

export const fullTaskSchema = z.object({
  ...taskSchema.shape,
  subTasks: z.array(
    z.object({
      ...createSelectSchema(tasksTable).omit({
        modifiedAt: true,
        createdAt: true,
      }).shape,
      createdAt: z.string(),
      modifiedAt: z.string().nullable(),
    }),
  ),
});

export const getTasksQuerySchema = paginationQuerySchema.merge(
  z.object({
    q: z.string().optional(),
    tableSort: z.enum(['projectId', 'status', 'createdBy', 'type', 'modifiedAt', 'createdAt']).default('createdAt').optional(),
    order: z.enum(['asc', 'desc']).default('asc').optional(),
    projectId: z.string(),
    status: z.string().optional(),
  }),
);

export const idParamSchema = z.object({
  id: idSchema,
});

export const relativeQuerySchema = z.object({
  edge: z.enum(['top', 'right', 'bottom', 'left']),
  currentOrder: z.number(),
  projectId: z.string(),
  sourceId: z.string(),
  parentId: z.string().optional(),
  status: z.number().optional(),
});
