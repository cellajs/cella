import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, foreignKey, index, pgPolicy, pgTable, unique, varchar } from 'drizzle-orm/pg-core';
import { appConfig, roles } from 'shared';
import { isAuthenticated, tenantContextSet, tenantMatch, userContextSet, userMatch } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantsTable } from '#/db/schema/tenants';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityIdColumns } from '#/db/utils/generate-context-entity-columns';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const roleEnum = roles.all;

const { organizationId, ...otherEntityIdColumns } = generateContextEntityIdColumns();

/**
 * Memberships table to track active memberships of users in organizations and other context entities.
 * Each membership belongs to exactly one tenant (RLS isolation boundary).
 */
export const membershipsTable = pgTable(
  'memberships',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar().primaryKey().$defaultFn(nanoid),
    // Tenant isolation
    tenantId: varchar('tenant_id', { length: 6 })
      .notNull()
      .references(() => tenantsTable.id),
    contextType: varchar({ enum: appConfig.contextEntityTypes }).notNull(),
    userId: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    role: varchar({ enum: roleEnum }).notNull().default('member'),
    createdBy: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'set null' }),
    modifiedAt: timestampColumns.modifiedAt,
    modifiedBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
    archived: boolean().default(false).notNull(),
    muted: boolean().default(false).notNull(),
    displayOrder: doublePrecision().notNull(),
    // Context entity columns
    organizationId: organizationId.notNull(),
    ...otherEntityIdColumns,
  },
  (table) => [
    index('memberships_user_id_idx').on(table.userId),
    index('memberships_organization_id_idx').on(table.organizationId),
    index('memberships_tenant_id_idx').on(table.tenantId),
    // Composite index for count queries by context type
    index('memberships_context_org_role_idx').on(table.contextType, table.organizationId, table.role),
    // Native composite unique constraint (replaces uniqueKey column)
    unique('memberships_tenant_user_org').on(table.tenantId, table.userId, table.organizationId),
    // Composite FK to organization (prevents franken-rows)
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),

    // RLS Policies: Cross-tenant read (user sees own memberships), tenant-scoped write
    // RESTRICTIVE guard: at least one context var must be set (defense-in-depth)
    pgPolicy('memberships_context_guard', {
      as: 'restrictive',
      for: 'select',
      using: sql`${tenantContextSet} OR ${userContextSet}`,
    }),
    // SELECT: Users can see their own memberships across tenants.
    // Viewing other org members is handled at app layer (requires membership check there).
    // This avoids infinite recursion that would occur if we checked membership here.
    pgPolicy('memberships_select_policy', {
      for: 'select',
      using: sql`${isAuthenticated} AND ${userMatch(table)}`,
    }),
    // INSERT: Strictly tenant-scoped
    pgPolicy('memberships_insert_policy', {
      for: 'insert',
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
    }),
    // UPDATE: Strictly tenant-scoped
    pgPolicy('memberships_update_policy', {
      for: 'update',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
    }),
    // DELETE: Strictly tenant-scoped
    pgPolicy('memberships_delete_policy', {
      for: 'delete',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
    }),
  ],
);

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
