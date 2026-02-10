import { index, pgEnum, pgTable, varchar } from 'drizzle-orm/pg-core';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoidTenant } from '#/utils/nanoid';

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'archived']);

/** Top-level isolation boundary for RLS. System resource, not an entity. */
export const tenantsTable = pgTable(
  'tenants',
  {
    id: varchar({ length: 24 }).primaryKey().$defaultFn(nanoidTenant),
    name: varchar().notNull(),
    status: tenantStatusEnum().notNull().default('active'),
    createdAt: timestampColumns.createdAt,
    modifiedAt: timestampColumns.modifiedAt,
  },
  (table) => [
    index('tenants_status_index').on(table.status),
    index('tenants_created_at_index').on(table.createdAt.desc()),
  ],
);

export type TenantModel = typeof tenantsTable.$inferSelect;
export type InsertTenantModel = typeof tenantsTable.$inferInsert;
