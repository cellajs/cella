import { index, pgEnum, pgTable, varchar } from 'drizzle-orm/pg-core';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoidTenant } from '#/utils/nanoid';

/**
 * Tenant status enum for lifecycle management.
 * - active: Normal operating state
 * - suspended: Temporarily disabled (e.g., billing issues)
 * - archived: Soft-deleted, pending permanent deletion
 */
export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'archived']);

/**
 * Tenants table for multi-tenant isolation.
 * Tenants are the top-level isolation boundary for RLS policies.
 * Each organization belongs to exactly one tenant.
 *
 * This is a system resource (not an entity) - no entityType, no CRUD routes.
 * Managed exclusively by system admins.
 */
export const tenantsTable = pgTable(
  'tenants',
  {
    id: varchar({ length: 24 }).primaryKey().$defaultFn(nanoidTenant),
    name: varchar().notNull(),
    status: tenantStatusEnum().notNull().default('active'),
    // Timestamps
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
