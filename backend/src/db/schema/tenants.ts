import { index, json, pgTable, varchar } from 'drizzle-orm/pg-core';
import { nanoidTenant } from 'shared/nanoid';
import { usersTable } from '#/db/schema/users';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { defaultRestrictions, type Restrictions } from '#/db/utils/tenant-restrictions';
import { timestampColumns } from '#/db/utils/timestamp-columns';

export const tenantStatusValues = ['active', 'suspended', 'archived'] as const;
export const subscriptionStatusValues = ['none', 'trialing', 'active', 'past_due', 'paused', 'canceled'] as const;

/** Top-level isolation boundary for RLS. System resource, not an entity. */
export const tenantsTable = pgTable(
  'tenants',
  {
    id: varchar({ length: tenantIdLength }).primaryKey().$defaultFn(nanoidTenant),
    name: varchar({ length: maxLength.field }).notNull(),
    status: varchar({ enum: tenantStatusValues }).notNull().default('active'),
    restrictions: json().$type<Restrictions>().notNull().default(defaultRestrictions()),
    createdBy: varchar({ length: maxLength.id }).references(() => usersTable.id, { onDelete: 'set null' }),
    subscriptionId: varchar({ length: maxLength.field }),
    subscriptionStatus: varchar({ enum: subscriptionStatusValues }).notNull().default('none'),
    subscriptionPlan: varchar({ length: maxLength.field }),
    subscriptionData: json(),
    createdAt: timestampColumns.createdAt,
    updatedAt: timestampColumns.updatedAt,
  },
  (table) => [
    index('tenants_status_index').on(table.status),
    index('tenants_created_at_index').on(table.createdAt.desc()),
    index('tenants_subscription_status_index').on(table.subscriptionStatus),
  ],
);

export type TenantModel = typeof tenantsTable.$inferSelect;
export type InsertTenantModel = typeof tenantsTable.$inferInsert;
