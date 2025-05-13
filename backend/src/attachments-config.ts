import { type PgColumn, index, varchar } from 'drizzle-orm/pg-core';
import { organizationsTable } from './db/schema/organizations';

/**
 * Schema configuration for the attachments table.
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
