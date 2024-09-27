import { relations } from 'drizzle-orm';
import { type AnyPgColumn, boolean, doublePrecision, index, integer, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';
import { organizationsTable } from './organizations';
import { projectsTable } from './projects';

export const tasksTable = pgTable(
  'tasks',
  {
    id: varchar('id').primaryKey().$defaultFn(nanoid),
    slug: varchar('slug').notNull(),
    entity: varchar('entity', { enum: ['task'] })
      .notNull()
      .default('task'),
    description: varchar('description').notNull(),
    keywords: varchar('keywords').notNull(),
    expandable: boolean('expandable').default(false).notNull(),
    summary: varchar('summary').notNull(),
    type: varchar('type', {
      enum: ['bug', 'feature', 'chore'],
    }).notNull(),
    impact: integer('impact'),
    // order is a reserved keyword in Postgres, so we need to use a different name
    order: doublePrecision('sort_order').notNull(),
    status: integer('status').notNull(),
    parentId: varchar('parent_id').references((): AnyPgColumn => tasksTable.id),
    labels: jsonb('labels').$type<string[]>().notNull().default([]),
    assignedTo: jsonb('assigned_to').$type<string[]>().notNull().default([]),
    organizationId: varchar('organization_id')
      .notNull()
      .references(() => organizationsTable.id, {
        onDelete: 'cascade',
      }),
    projectId: varchar('project_id')
      .notNull()
      .references(() => projectsTable.id, {
        onDelete: 'cascade',
      }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: varchar('created_by')
      .notNull()
      .default('unknown')
      .references(() => usersTable.id, {
        onDelete: 'set default',
      }),
    modifiedAt: timestamp('modified_at'),
    modifiedBy: varchar('modified_by').references(() => usersTable.id, {
      onDelete: 'set null',
    }),
  },
  (table) => {
    return {
      tasksDescriptionIdx: index('idx_tasks_description').on(table.description),
      tasksProjectIdx: index('idx_tasks_project').on(table.projectId),
      tasksKeywordsIdx: index('idx_tasks_keywords').on(table.keywords),
    };
  },
);

export const tasksTableRelations = relations(tasksTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [tasksTable.organizationId],
    references: [organizationsTable.id],
  }),
  project: one(projectsTable, {
    fields: [tasksTable.projectId],
    references: [projectsTable.id],
  }),
  createdByUser: one(usersTable, {
    fields: [tasksTable.createdBy],
    references: [usersTable.id],
  }),
  modifiedByUser: one(usersTable, {
    fields: [tasksTable.modifiedBy],
    references: [usersTable.id],
  }),
  parentTask: one(tasksTable, {
    fields: [tasksTable.parentId],
    references: [tasksTable.id],
  }),
}));

export type TaskModel = typeof tasksTable.$inferSelect;
export type InsertTaskModel = typeof tasksTable.$inferInsert;
