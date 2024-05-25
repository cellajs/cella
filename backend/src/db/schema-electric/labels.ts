import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from '../../lib/nanoid';

export const labelsTable = pgTable('labels', {
  id: varchar('id').primaryKey().$defaultFn(nanoid),
  name: varchar('name').notNull(),
  color: varchar('color'),
  projectId: varchar('project_id').notNull(),
});

export type LabelModel = typeof labelsTable.$inferSelect;
export type InsertLabelModel = typeof labelsTable.$inferInsert;
