import { sql } from 'drizzle-orm';
import { check, index, jsonb, snakeCase, varchar } from 'drizzle-orm/pg-core';
import { tenantKindValues } from 'shared';
import { nanoidTenant } from 'shared/utils/nanoid';
import { auditColumns } from '#/db/utils/audit-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { isoTimestamp } from '#/db/utils/timestamp-columns';
import type { AuthStrategy } from '#/modules/auth/sessions/sessions-db';
import { defaultRestrictions } from '#/modules/tenants/tenant-restrictions';
import type { Restrictions } from '#/modules/tenants/tenants-schema';

export const tenantStatusValues = ['active', 'suspended', 'archived'] as const;
export const subscriptionStatusValues = ['none', 'trialing', 'active', 'past_due', 'paused', 'canceled'] as const;

/** Top-level isolation boundary for RLS. System resource, not an entity. */
export const tenantsTable = snakeCase.table(
  'tenants',
  {
    id: varchar({ length: tenantIdLength }).primaryKey().$defaultFn(nanoidTenant),
    name: varchar({ length: maxLength.field }).notNull(),
    /** What the tenant is for (`appConfig.tenantKinds`): `live` unless a system admin marks it `test`; `demo` only through `createDemo`. */
    kind: varchar({ enum: tenantKindValues }).notNull().default('live'),
    status: varchar({ enum: tenantStatusValues }).notNull().default('active'),
    /** When `status` last changed, stamped by the server; an archived tenant is removed `archivedTenantDays` after it. */
    statusChangedAt: isoTimestamp().defaultNow().notNull(),
    /** When the tenant goes with everything in it, whatever its status; a demo carries one, another kind may. */
    expiresAt: isoTimestamp(),
    restrictions: jsonb().$type<Restrictions>().notNull().default(defaultRestrictions()),
    /** Sign-in methods the tenant's members may use (empty = every enabled method); `tenantGuard` enforces them. */
    authStrategies: jsonb().$type<AuthStrategy[]>().notNull().default([]),
    subscriptionId: varchar({ length: maxLength.field }),
    subscriptionStatus: varchar({ enum: subscriptionStatusValues }).notNull().default('none'),
    subscriptionPlan: varchar({ length: maxLength.field }),
    ...auditColumns(),
  },
  (table) => [
    index('tenants_kind_index').on(table.kind),
    index('tenants_status_index').on(table.status),
    index('tenants_expires_at_index').on(table.expiresAt),
    index('tenants_created_at_index').on(table.createdAt.desc()),
    index('tenants_created_by_index').on(table.createdBy),
    index('tenants_subscription_status_index').on(table.subscriptionStatus),
    check('tenants_demo_expires_check', sql`${table.kind} <> 'demo' OR ${table.expiresAt} IS NOT NULL`),
  ],
);

export type TenantModel = typeof tenantsTable.$inferSelect;
export type InsertTenantModel = typeof tenantsTable.$inferInsert;
