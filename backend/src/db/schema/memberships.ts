import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, foreignKey, index, pgPolicy, pgTable, unique, varchar } from 'drizzle-orm/pg-core';
import { appConfig, roles } from 'shared';
import { nanoid } from 'shared/nanoid';
import { isAuthenticated, tenantContextSet, tenantMatch, userContextSet } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantsTable } from '#/db/schema/tenants';
import { usersTable } from '#/db/schema/users';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

const roleEnum = roles.all;

/**
 * Memberships table to track active memberships of users in organizations and other context entities.
 * Each membership belongs to exactly one tenant (RLS isolation boundary).
 */
export const membershipsTable = pgTable(
  'memberships',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
    tenantId: varchar('tenant_id', { length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    contextType: varchar({ enum: appConfig.contextEntityTypes }).notNull(),
    userId: varchar({ length: maxLength.id })
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    role: varchar({ enum: roleEnum }).notNull().default('member'),
    createdBy: varchar({ length: maxLength.id })
      .notNull()
      .references(() => usersTable.id, { onDelete: 'set null' }),
    modifiedAt: timestampColumns.modifiedAt,
    modifiedBy: varchar({ length: maxLength.id }).references(() => usersTable.id, { onDelete: 'set null' }),
    archived: boolean().default(false).notNull(),
    muted: boolean().default(false).notNull(),
    displayOrder: doublePrecision().notNull(),
    organizationId: varchar({ length: maxLength.id })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('memberships_user_id_idx').on(table.userId),
    index('memberships_organization_id_idx').on(table.organizationId),
    index('memberships_tenant_id_idx').on(table.tenantId),
    index('memberships_context_org_role_idx').on(table.contextType, table.organizationId, table.role),
    // Include contextType + all entity ID columns so forks with additional context types
    // (e.g. workspace, project) get proper uniqueness without manual schema changes.
    // nullsNotDistinct ensures NULL entity IDs are treated as equal, preventing duplicates.
    unique('memberships_tenant_user_ctx')
      .on(
        table.tenantId,
        table.userId,
        table.contextType,
        ...appConfig.contextEntityTypes.map((t) => table[appConfig.entityIdColumnKeys[t] as keyof typeof table]),
      )
      .nullsNotDistinct(),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
    // Restrictive guard: at least one context var must be set (defense-in-depth)
    pgPolicy('memberships_context_guard', {
      as: 'restrictive',
      for: 'select',
      using: sql`${tenantContextSet} OR ${userContextSet}`,
    }),
    // All authenticated users can read memberships. Membership rows are relationship
    // graph data (userId, orgId, role) with no PII — acceptable to expose broadly.
    // This enables cross-tenant queries (relatableGuard, getUsers filter) to see
    // other users' memberships without RLS workarounds. The restrictive context_guard
    // above still requires at least one session var to be set.
    pgPolicy('memberships_select_authenticated_policy', {
      for: 'select',
      using: sql`${isAuthenticated}`,
    }),
    pgPolicy('memberships_insert_policy', {
      for: 'insert',
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
    }),
    pgPolicy('memberships_update_policy', {
      for: 'update',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
    }),
    pgPolicy('memberships_delete_policy', {
      for: 'delete',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
    }),
  ],
);

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
