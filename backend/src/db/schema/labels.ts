import { relations } from 'drizzle-orm';
import { integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';
import { organizationsTable } from './organizations';
import { projectsTable } from './projects';

export const labelsTable = pgTable('labels', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  name: varchar('name').notNull(),
  color: varchar('color'),
  entity: varchar('entity', { enum: ['label'] })
    .notNull()
    .default('label'),
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
  lastUsed: timestamp('last_used').defaultNow().notNull(),
  useCount: integer('use_count').notNull(),
});

export const labelksTableRelations = relations(labelsTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [labelsTable.organizationId],
    references: [organizationsTable.id],
  }),
  project: one(projectsTable, {
    fields: [labelsTable.projectId],
    references: [projectsTable.id],
  }),
}));

export type LabelModel = typeof labelsTable.$inferSelect;
export type InsertLabelModel = typeof labelsTable.$inferInsert;
