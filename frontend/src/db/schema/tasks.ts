import { integer, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// id: string;
// slug: string;
// markdown: string;
// summary: string;
// createdBy: string;
// createdAt: Date;
// assignedBy: string;
// assignedTo: TaskUser[];
// assignedAt: Date;
// modifiedBy: string;
// modifiedAt: Date;
// type: TaskType;
// impact: TaskImpact;
// status: TaskStatus;
// labels: TaskLabel[];
// projectId: string;

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey(),
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
  projectId: uuid('project_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  assignedBy: varchar('assigned_by'),
  assignedAt: timestamp('assigned_at'),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by'),
});

// id: string;
// value: string;
// color: string | null;
// count: number;
// groupId: string | null;
// lastActive: Date;
// projectId: string;

export const labels = pgTable('labels', {
  id: uuid('id').primaryKey(),
  name: varchar('name').notNull(),
  color: varchar('color'),
  projectId: uuid('project_id').notNull(),
});

export const taskLabels = pgTable(
  'task_labels',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, {
        onDelete: 'cascade',
      }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, {
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

export const taskUsers = pgTable(
  'task_users',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, {
        onDelete: 'cascade',
      }),
    userId: uuid('user_id').notNull(),
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
