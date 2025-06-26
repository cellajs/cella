import { index, type PgColumn, varchar } from 'drizzle-orm/pg-core';
import { organizationsTable } from './db/schema/organizations';

/**
 * Include app-specific entity relations - or custom columns - in attachments table.
 * This configuration includes the columns and indexes for relations in the attachments table.
 */
export const attachmentRelations = {
  columns: {
    organizationId: varchar()
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
  },
  indexes: (table: { organizationId: PgColumn }) => [index('attachments_organization_id_index').on(table.organizationId)],
};
