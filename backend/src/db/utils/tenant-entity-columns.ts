import { uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/**
 * Creates base columns shared by all tenant-scoped entities (channel entities, product entities).
 * Users are cross-tenant and do not use this.
 */
export const tenantEntityColumns = <T extends string>(entityType: T) => ({
  createdAt: timestampColumns.createdAt,
  id: uuid().primaryKey().$defaultFn(generateId),
  entityType: varchar({ enum: [entityType] })
    .notNull()
    .default(entityType),
  tenantId: varchar('tenant_id', { length: tenantIdLength })
    .notNull()
    .references(() => tenantsTable.id),
  name: varchar({ length: maxLength.field }).notNull(),
  updatedAt: timestampColumns.updatedAt,
});
