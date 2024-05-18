import { integer, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '~/lib/utils';

export const tasksTable = pgTable('tasks', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  slug: varchar('slug').notNull(),
  markdown: varchar('markdown'),
  summary: varchar('summary').notNull(),
  type: varchar('type', {
    enum: ['bug', 'feature', 'chore'],
  }).notNull(),
  impact: integer('impact'),
  // order is a reserved keyword in Postgres, so we need to use a different name
  order: integer('sort_order'),
  status: integer('status').notNull(),
  projectId: varchar('project_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  assignedBy: varchar('assigned_by'),
  assignedAt: timestamp('assigned_at'),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by'),
});

export const labelsTable = pgTable('labels', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  name: varchar('name').notNull(),
  color: varchar('color'),
  projectId: varchar('project_id').notNull(),
});

export const taskLabelsTable = pgTable(
  'task_labels',
  {
    taskId: varchar('task_id')
      .notNull()
      .references(() => tasksTable.id, {
        onDelete: 'cascade',
      }),
    labelId: varchar('label_id')
      .notNull()
      .references(() => labelsTable.id, {
        onDelete: 'cascade',
      }),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.labelId, table.taskId],
      }),
    };
  },
);

export const taskUsersTable = pgTable(
  'task_users',
  {
    taskId: varchar('task_id')
      .notNull()
      .references(() => tasksTable.id, {
        onDelete: 'cascade',
      }),
    userId: varchar('user_id').notNull(),
    role: varchar('role', {
      enum: ['ASSIGNED', 'CREATED'],
    }).notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({
        columns: [table.userId, table.taskId],
      }),
    };
  },
);
