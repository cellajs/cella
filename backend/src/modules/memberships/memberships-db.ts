import { boolean, doublePrecision, foreignKey, index, snakeCase, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig, hierarchy, roles } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { membershipChannelColumns, membershipChannelIndexes } from '#/db/utils/channel-relation-columns';
import { tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { usersTable } from '#/modules/user/user-db';

const roleEnum = roles.all;

/**
 * Active memberships of users in organizations and other channel entities. Each belongs to exactly one tenant (RLS
 * isolation boundary). Sub-root channel columns and their indexes come from the hierarchy, shared with inactive-memberships.
 */
export const membershipsTable = snakeCase.table(
  'memberships',
  {
    createdAt: timestampColumns.createdAt,
    id: uuid().primaryKey().$defaultFn(generateId),
    tenantId: varchar('tenant_id', { length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    channelType: varchar({ enum: appConfig.channelEntityTypes }).notNull(),
    channelId: uuid('channel_id').notNull(),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    role: varchar({ enum: roleEnum }).notNull().default(hierarchy.getLeastPrivilegedRole(hierarchy.rootChannelType)),
    createdBy: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'set null' }),
    updatedAt: timestampColumns.updatedAt,
    updatedBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
    archived: boolean().default(false).notNull(),
    muted: boolean().default(false).notNull(),
    displayOrder: doublePrecision().notNull(),
    organizationId: uuid().notNull(),
    ...membershipChannelColumns(),
  },
  (table) => [
    index('memberships_user_id_idx').on(table.userId),
    index('memberships_created_by_idx').on(table.createdBy),
    index('memberships_updated_by_idx').on(table.updatedBy),
    index('memberships_tenant_id_idx').on(table.tenantId),
    index('memberships_channel_org_role_idx').on(table.channelType, table.organizationId, table.role),
    ...membershipChannelIndexes('memberships', table),
    // Composite index for application-layer membership lookups (orgGuard, permission checks)
    index('memberships_org_user_tenant_idx').on(table.organizationId, table.userId, table.tenantId),
    // One membership per user per entity
    unique('memberships_unique_channel').on(table.tenantId, table.userId, table.channelId),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
  ],
);

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
