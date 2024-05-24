import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../../nanoid';

// TODO: Add a 'type' column or virtual property with a static value of "label" to directly identify the resource type in the data
// TODO: Store organizationId and workspaceId (full parent tree) to directly retrieve all labels within various contexts
// TODO: Add createdAt and createdBy properties to the data model
export const labelsTable = pgTable('labels', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  name: varchar('name').notNull(),
  color: varchar('color'),
  projectId: varchar('project_id').notNull(),
});

export type LabelModel = typeof labelsTable.$inferSelect;
export type InsertLabelModel = typeof labelsTable.$inferInsert;
