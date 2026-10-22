import { uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { auditColumns } from '#/db/utils/audit-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/** Shared by channel and product entities. Users are cross-tenant and do not use this. */
export const tenantEntityColumns = <T extends string>(entityType: T) => ({
  id: uuid().primaryKey().$defaultFn(generateId),
  entityType: varchar({ enum: [entityType] })
    .notNull()
    .default(entityType),
  tenantId: varchar({ length: tenantIdLength })
    .notNull()
    .references(() => tenantsTable.id),
  name: varchar({ length: maxLength.field }).notNull(),
  ...auditColumns(),
});
