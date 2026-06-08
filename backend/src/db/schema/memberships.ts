import { boolean, doublePrecision, foreignKey, index, snakeCase, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig, roles } from 'shared';
import { generateId } from 'shared/entity-id';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantsTable } from '#/db/schema/tenants';
import { usersTable } from '#/db/schema/users';
import { tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

const roleEnum = roles.all;

/**
 * Sub-context relation columns (below `organization`) shared with inactive-memberships,
 * so both membership tables stay structurally identical. Fork-owned: cella ships none;
 * forks add e.g. `workspaceId`/`projectId` here (with their foreign keys). Returns fresh
 * column builders on each call so the two tables don't share builder instances.
 */
export const membershipContextColumns = () => ({});

/**
 * Memberships table to track active memberships of users in organizations and other context entities.
 * Each membership belongs to exactly one tenant (RLS isolation boundary).
 */
export const membershipsTable = snakeCase.table(
  'memberships',
  {
    createdAt: timestampColumns.createdAt,
    id: uuid().primaryKey().$defaultFn(generateId),
    tenantId: varchar('tenant_id', { length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    contextType: varchar({ enum: appConfig.contextEntityTypes }).notNull(),
    contextId: uuid('context_id').notNull(),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    role: varchar({ enum: roleEnum }).notNull().default('member'),
    createdBy: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'set null' }),
    updatedAt: timestampColumns.updatedAt,
    updatedBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
    archived: boolean().default(false).notNull(),
    muted: boolean().default(false).notNull(),
    displayOrder: doublePrecision().notNull(),
    organizationId: uuid().notNull(),
    ...membershipContextColumns(),
  },
  (table) => [
    index('memberships_user_id_idx').on(table.userId),
    index('memberships_created_by_idx').on(table.createdBy),
    index('memberships_updated_by_idx').on(table.updatedBy),
    index('memberships_tenant_id_idx').on(table.tenantId),
    index('memberships_context_org_role_idx').on(table.contextType, table.organizationId, table.role),
    // Composite index for application-layer membership lookups (orgGuard, permission checks)
    index('memberships_org_user_tenant_idx').on(table.organizationId, table.userId, table.tenantId),
    // One membership per user per entity
    unique('memberships_unique_context').on(table.tenantId, table.userId, table.contextId),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
  ],
);

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
