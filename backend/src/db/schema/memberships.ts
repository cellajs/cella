import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, foreignKey, index, pgPolicy, pgTable, unique, varchar } from 'drizzle-orm/pg-core';
import { appConfig, roles } from 'shared';
import { isAuthenticated, tenantContextSet, tenantMatch, userContextSet, userMatch } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantsTable } from '#/db/schema/tenants';
import { usersTable } from '#/db/schema/users';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const roleEnum = roles.all;

/**
 * Generate slug columns for each context entity type dynamically.
 * These store the entity slugs for quick access without needing to join.
 */
const contextEntitySlugColumns = appConfig.contextEntityTypes.reduce(
  (acc, entityType) => {
    const slugColumnKey = appConfig.entitySlugColumnKeys[entityType];
    if (slugColumnKey) {
      acc[slugColumnKey] = varchar({ length: maxLength.field });
    }
    return acc;
  },
  {} as Record<string, ReturnType<typeof varchar>>,
);

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
    // Dynamic slug columns for each context entity type
    ...contextEntitySlugColumns,
  },
  (table) => [
    index('memberships_user_id_idx').on(table.userId),
    index('memberships_organization_id_idx').on(table.organizationId),
    index('memberships_tenant_id_idx').on(table.tenantId),
    index('memberships_context_org_role_idx').on(table.contextType, table.organizationId, table.role),
    // Indexes for slug columns
    ...appConfig.contextEntityTypes
      .filter((t) => appConfig.entitySlugColumnKeys[t])
      .map((t) =>
        index(`memberships_${appConfig.entitySlugColumnKeys[t]}_idx`).on(
          table[appConfig.entitySlugColumnKeys[t] as keyof typeof table],
        ),
      ),
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
    // Own memberships visible across all tenants (for /me routes)
    pgPolicy('memberships_select_own_policy', {
      for: 'select',
      using: sql`${isAuthenticated} AND ${userMatch(table)}`,
    }),
    // All tenant memberships visible. Cannot use membershipExists here (self-referencing → infinite recursion).
    pgPolicy('memberships_select_tenant_policy', {
      for: 'select',
      using: sql`${isAuthenticated} AND ${tenantMatch(table)}`,
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
