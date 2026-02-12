import { varchar } from 'drizzle-orm/pg-core';
import { tenantsTable } from '#/db/schema/tenants';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/**
 * Creates base columns shared by all tenant-scoped entities (context entities, product entities).
 * Contains id, entityType, tenantId, name, description, createdAt, and modifiedAt.
 * Note: users are cross-tenant and do not use this.
 */
export const tenantEntityColumns = <T extends string>(entityType: T) => ({
  // Created at on top to have it as first column in the table
  createdAt: timestampColumns.createdAt,
  // Identity
  id: varchar().primaryKey().$defaultFn(nanoid),
  entityType: varchar({ enum: [entityType] })
    .notNull()
    .default(entityType),
  // Tenant isolation
  tenantId: varchar('tenant_id')
    .notNull()
    .references(() => tenantsTable.id),
  // Metadata
  name: varchar().notNull(),
  description: varchar(),
  // Modification tracking
  modifiedAt: timestampColumns.modifiedAt,
});
