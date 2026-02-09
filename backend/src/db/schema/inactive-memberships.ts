import { sql } from 'drizzle-orm';
import { foreignKey, index, pgPolicy, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { appConfig, roles } from 'shared';
import { isAuthenticated, membershipExists, tenantMatch } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantsTable } from '#/db/schema/tenants';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityIdColumns } from '#/db/utils/generate-context-entity-columns';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const roleEnum = roles.all;

const { organizationId, ...otherEntityIdColumns } = generateContextEntityIdColumns();

/**
 * Inactive memberships table to track memberships that have are pending (invitations) or rejected.
 * They are a subset of the membershipsTable columns, and include email and rejectedAt fields to track
 * the status of the inactive membership.
 * Each inactive membership belongs to exactly one tenant (RLS isolation boundary).
 */
export const inactiveMembershipsTable = pgTable(
  'inactive_memberships',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar().primaryKey().$defaultFn(nanoid),
    // Tenant isolation
    tenantId: varchar('tenant_id', { length: 6 })
      .notNull()
      .references(() => tenantsTable.id),
    contextType: varchar({ enum: appConfig.contextEntityTypes }).notNull(),
    email: varchar().notNull(),
    userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
    tokenId: varchar(), // References tokens.id logically (no FK due to partitioning)
    role: varchar({ enum: roleEnum }).notNull().default('member'),
    rejectedAt: timestamp({ mode: 'string' }),
    createdBy: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    // Context entity columns
    organizationId: organizationId.notNull(),
    ...otherEntityIdColumns,
  },
  (table) => [
    index('inactive_memberships_user_id_idx').on(table.userId),
    index('inactive_memberships_organization_id_idx').on(table.organizationId),
    index('inactive_memberships_tenant_id_idx').on(table.tenantId),
    index('inactive_memberships_email_idx').on(table.email),
    // Composite index for pending invite count queries
    index('inactive_memberships_org_pending_idx').on(table.organizationId, table.rejectedAt),
    // Native composite unique constraint (replaces uniqueKey column)
    unique('inactive_memberships_tenant_email_org').on(table.tenantId, table.email, table.organizationId),
    // Composite FK to organization (prevents franken-rows)
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),

    // RLS Policies: Tenant-scoped with membership verification
    // SELECT: Requires membership in organization (to see pending invites)
    pgPolicy('inactive_memberships_select_policy', {
      for: 'select',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
    // INSERT: Requires membership in target organization
    pgPolicy('inactive_memberships_insert_policy', {
      for: 'insert',
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
    // UPDATE: Requires membership
    pgPolicy('inactive_memberships_update_policy', {
      for: 'update',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
    // DELETE: Requires membership
    pgPolicy('inactive_memberships_delete_policy', {
      for: 'delete',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
  ],
);

export type InactiveMembershipModel = typeof inactiveMembershipsTable.$inferSelect;
export type InsertInactiveMembershipModel = typeof inactiveMembershipsTable.$inferInsert;
