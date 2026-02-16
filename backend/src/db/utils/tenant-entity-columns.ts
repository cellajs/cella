import { varchar } from 'drizzle-orm/pg-core';
import { tenantsTable } from '#/db/schema/tenants';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/**
 * Creates base columns shared by all tenant-scoped entities (context entities, product entities).
 * Note: users are cross-tenant and do not use this.
 */
export const tenantEntityColumns = <T extends string>(entityType: T) => ({
  createdAt: timestampColumns.createdAt,
  id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
  entityType: varchar({ enum: [entityType] })
    .notNull()
    .default(entityType),
  tenantId: varchar('tenant_id', { length: tenantIdLength })
    .notNull()
    .references(() => tenantsTable.id),
  name: varchar({ length: maxLength.field }).notNull(),
  modifiedAt: timestampColumns.modifiedAt,
});
