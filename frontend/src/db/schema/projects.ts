import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: varchar('id').primaryKey(),
  organizationId: varchar('organization_id').notNull(),
  name: varchar('name').notNull(),
  description: varchar('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by'),
});

export const tasks = pgTable('tasks', {
  id: varchar('id').primaryKey(),
  projectId: varchar('project_id').references(() => projects.id, {
    onDelete: 'cascade'
  }),
  name: varchar('name').notNull(),
  description: varchar('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  modifiedAt: timestamp('modified_at'),
  modifiedBy: varchar('modified_by'),
});