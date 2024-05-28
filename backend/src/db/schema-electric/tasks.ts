import { integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';

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
  organizationId: varchar('organization_id').notNull(),
  workspaceId: varchar('workspace_id').notNull(),
  projectId: varchar('project_id').notNull(),
  createdAt: timestamp('created_at')
    // .defaultNow()
    .notNull(),
  createdBy: varchar('created_by').notNull(),
  assignedBy: varchar('assigned_by'),
  assignedAt: timestamp('assigned_at'),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by'),
});

export type TaskModel = typeof tasksTable.$inferSelect;
export type InsertTaskModel = typeof tasksTable.$inferInsert;
