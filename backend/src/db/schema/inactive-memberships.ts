import { foreignKey, index, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { appConfig, roles } from 'shared';
import { membershipCrudPolicies } from '#/db/rls-helpers';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantsTable } from '#/db/schema/tenants';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityIdColumns } from '#/db/utils/generate-context-entity-columns';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const roleEnum = roles.all;

const { organizationId, ...otherEntityIdColumns } = generateContextEntityIdColumns();

/** Inactive memberships track pending invitations and rejected membership requests. */
export const inactiveMembershipsTable = pgTable(
  'inactive_memberships',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar().primaryKey().$defaultFn(nanoid),
    tenantId: varchar('tenant_id', { length: 24 })
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
    organizationId: organizationId.notNull(),
    ...otherEntityIdColumns,
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
    ...membershipCrudPolicies('inactive_memberships', table),
  ],
);

export type InactiveMembershipModel = typeof inactiveMembershipsTable.$inferSelect;
export type InsertInactiveMembershipModel = typeof inactiveMembershipsTable.$inferInsert;
