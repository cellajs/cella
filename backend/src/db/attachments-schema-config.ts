import { varchar } from 'drizzle-orm/pg-core';
import { organizationsTable } from './schema/organizations';

/**
 * Additional columns for the attachments table to establish relationships with other entity tables (e.g., Products or Contexts).
 * These columns ensure flexible attachment associations, it helps adapts to various use cases. Use references actions
 * to manage the expected behavior with related data.
 */
export const attachmentRelationsColumns = {
  organizationId: varchar()
    .notNull()
    .references(() => organizationsTable.id, { onDelete: 'cascade' }),
};
