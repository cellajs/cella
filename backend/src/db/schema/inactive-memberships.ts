import { sql } from 'drizzle-orm';
import { foreignKey, index, pgPolicy, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { appConfig, roles } from 'shared';
import { nanoid } from 'shared/nanoid';
import { isAuthenticated, orgScopedCrudPolicies, userMatch } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantsTable } from '#/db/schema/tenants';
import { usersTable } from '#/db/schema/users';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

const roleEnum = roles.all;

/** Inactive memberships track pending invitations and rejected membership requests. */
export const inactiveMembershipsTable = pgTable(
  'inactive_memberships',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
    tenantId: varchar('tenant_id', { length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    contextType: varchar({ enum: appConfig.contextEntityTypes }).notNull(),
    email: varchar({ length: maxLength.field }).notNull(),
    userId: varchar({ length: maxLength.id }).references(() => usersTable.id, { onDelete: 'cascade' }),
    tokenId: varchar({ length: maxLength.id }), // References tokens.id logically (no FK due to partitioning)
    role: varchar({ enum: roleEnum }).notNull().default('member'),
    rejectedAt: timestamp({ mode: 'string' }),
    createdBy: varchar({ length: maxLength.id })
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    organizationId: varchar({ length: maxLength.id })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('inactive_memberships_user_id_idx').on(table.userId),
    index('inactive_memberships_organization_id_idx').on(table.organizationId),
    index('inactive_memberships_tenant_id_idx').on(table.tenantId),
    index('inactive_memberships_email_idx').on(table.email),
    index('inactive_memberships_org_pending_idx').on(table.organizationId, table.rejectedAt),
    // Include contextType + all entity ID columns so forks with additional context types
    // get proper uniqueness. nullsNotDistinct treats NULLs as equal.
    unique('inactive_memberships_tenant_email_ctx')
      .on(
        table.tenantId,
        table.email,
        table.contextType,
        ...appConfig.contextEntityTypes.map((t) => table[appConfig.entityIdColumnKeys[t] as keyof typeof table]),
      )
      .nullsNotDistinct(),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
    ...orgScopedCrudPolicies('inactive_memberships', table),
    // Own invitations visible across all tenants (for /me routes)
    pgPolicy('inactive_memberships_select_own_policy', {
      for: 'select',
      using: sql`${isAuthenticated} AND ${userMatch(table)}`,
    }),
  ],
);

export type InactiveMembershipModel = typeof inactiveMembershipsTable.$inferSelect;
export type InsertInactiveMembershipModel = typeof inactiveMembershipsTable.$inferInsert;
