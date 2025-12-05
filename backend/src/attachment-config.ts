import { index, type PgColumn, varchar } from 'drizzle-orm/pg-core';
import { organizationsTable } from '#/db/schema/organizations';

/**
 * Include app-specific entity ids - or custom columns - in attachments table.
 */
export const attachmentEntityColumns = {
  organizationId: varchar()
    .notNull()
    .references(() => organizationsTable.id, { onDelete: 'cascade' }),
};

/**
 * Include app-specific entity id indexes - or custom indexes - for attachments table.
 */
export const attachmentEntityIndexes = (table: { organizationId: PgColumn }) => [index('attachments_organization_id_index').on(table.organizationId)];
