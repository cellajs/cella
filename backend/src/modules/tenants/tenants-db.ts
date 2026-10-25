import { index, json, snakeCase, varchar } from 'drizzle-orm/pg-core';
import { nanoidTenant } from 'shared/utils/nanoid';
import { auditColumns } from '#/db/utils/audit-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { isoTimestamp } from '#/db/utils/timestamp-columns';
import type { AuthStrategy } from '#/modules/auth/sessions/sessions-db';
import { defaultRestrictions, type Restrictions } from '#/modules/tenants/tenant-restrictions';

export const tenantStatusValues = ['active', 'suspended', 'archived'] as const;
export const subscriptionStatusValues = ['none', 'trialing', 'active', 'past_due', 'paused', 'canceled'] as const;

/** Top-level isolation boundary for RLS. System resource, not an entity. */
export const tenantsTable = snakeCase.table(
  'tenants',
  {
    id: varchar({ length: tenantIdLength }).primaryKey().$defaultFn(nanoidTenant),
    name: varchar({ length: maxLength.field }).notNull(),
    status: varchar({ enum: tenantStatusValues }).notNull().default('active'),
    /** When `status` last changed, stamped by the server; an archived tenant is removed `archivedTenantDays` after it. */
    statusChangedAt: isoTimestamp().defaultNow().notNull(),
    restrictions: json().$type<Restrictions>().notNull().default(defaultRestrictions()),
    // Sign-in strategies a tenant's members may use (empty = all enabled); enforced at the tenant boundary (tenantGuard) once SSO ships.
    authStrategies: json().$type<AuthStrategy[]>().notNull().default([]),
    subscriptionId: varchar({ length: maxLength.field }),
    subscriptionStatus: varchar({ enum: subscriptionStatusValues }).notNull().default('none'),
    subscriptionPlan: varchar({ length: maxLength.field }),
    ...auditColumns(),
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
