import { type AnyPgColumn, doublePrecision, index, integer, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';

export const tasksTable = pgTable(
  'tasks',
  {
    id: varchar('id').primaryKey().$defaultFn(nanoid),
    slug: varchar('slug').notNull(),
    description: varchar('description'),
    summary: varchar('summary').notNull(),
    type: varchar('type', {
      enum: ['bug', 'feature', 'chore'],
    }).notNull(),
    impact: integer('impact'),
    // order is a reserved keyword in Postgres, so we need to use a different name
    order: doublePrecision('sort_order').notNull(),
    status: integer('status').notNull(),
    parentId: varchar('parent_id').references((): AnyPgColumn => tasksTable.id),
    labels: jsonb('labels')
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    // labels: jsonb('labels').$type<string[]>().notNull().default([]),
    assignedTo: jsonb('assigned_to')
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    // assignedTo: jsonb('assigned_to').$type<string[]>().notNull().default([]),
    organizationId: varchar('organization_id').notNull(),
    projectId: varchar('project_id').notNull(),
    createdAt: timestamp('created_at')
      // .defaultNow()
      .notNull(),
    createdBy: varchar('created_by').notNull(),
    modifiedAt: timestamp('modified_at'),
    modifiedBy: varchar('modified_by'),
  },
  (table) => {
    return {
      tasksDescriptionIdx: index('idx_tasks_description').on(table.description),
      tasksProjectIdx: index('idx_tasks_project').on(table.projectId),
    };
  },
);

export type TaskModel = typeof tasksTable.$inferSelect;
export type InsertTaskModel = typeof tasksTable.$inferInsert;
