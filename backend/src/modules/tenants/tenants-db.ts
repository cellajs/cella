import { index, json, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { nanoidTenant } from 'shared/utils/nanoid';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import type { AuthStrategy } from '#/modules/auth/sessions-db';
import { defaultRestrictions, type Restrictions } from '#/modules/tenants/tenant-restrictions';
import { usersTable } from '#/modules/user/user-db';

export const tenantStatusValues = ['active', 'suspended', 'archived'] as const;
export const subscriptionStatusValues = ['none', 'trialing', 'active', 'past_due', 'paused', 'canceled'] as const;

/** Top-level isolation boundary for RLS. System resource, not an entity. */
export const tenantsTable = snakeCase.table(
  'tenants',
  {
    id: varchar({ length: tenantIdLength }).primaryKey().$defaultFn(nanoidTenant),
    name: varchar({ length: maxLength.field }).notNull(),
    status: varchar({ enum: tenantStatusValues }).notNull().default('active'),
    restrictions: json().$type<Restrictions>().notNull().default(defaultRestrictions()),
    // Auth strategies a tenant's members are allowed to sign in with (empty = all enabled strategies).
    // Relocated from the unenforced organizations.authStrategies. Enforcement lives at the tenant
    // boundary (tenantGuard) and is deferred to the SSO build — nothing reads this yet.
    authStrategies: json().$type<AuthStrategy[]>().notNull().default([]),
    createdBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
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
    index('tenants_created_by_index').on(table.createdBy),
    index('tenants_subscription_status_index').on(table.subscriptionStatus),
  ],
);

export type TenantModel = typeof tenantsTable.$inferSelect;
export type InsertTenantModel = typeof tenantsTable.$inferInsert;
