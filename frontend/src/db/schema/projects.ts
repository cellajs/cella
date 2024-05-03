import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// id: string;
// slug: string;
// name: string;
// color: string;
// workspaceId: string;
// role: 'ADMIN' | 'MEMBER';
// createdBy: string;
// createdAt: Date;
// modifiedBy: string;
// modifiedAt: Date;
// members: TaskUser[];

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey(),
  slug: varchar('slug').notNull(),
  name: varchar('name').notNull(),
  color: varchar('color').notNull(),
  workspaceId: varchar('workspace_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by'),
});

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
  status: integer('status').notNull(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, {
      onDelete: 'cascade',
    }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  assignedBy: varchar('assigned_by'),
  assignedAt: timestamp('assigned_at'),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by'),
});
