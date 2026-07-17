import { foreignKey, index, snakeCase, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig, roles } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { membershipChannelColumns } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { usersTable } from '#/modules/user/user-db';

const roleEnum = roles.all;

/**
 * Inactive memberships track pending invitations and rejected membership requests.
 */
export const inactiveMembershipsTable = snakeCase.table(
  'inactive_memberships',
  {
    createdAt: timestampColumns.createdAt,
    id: uuid().primaryKey().$defaultFn(generateId),
    tenantId: varchar('tenant_id', { length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    channelType: varchar({ enum: appConfig.channelEntityTypes }).notNull(),
    channelId: uuid('channel_id').notNull(),
    email: varchar({ length: maxLength.field }).notNull(),
    userId: uuid().references(() => usersTable.id, { onDelete: 'cascade' }),
    tokenId: uuid(), // References tokens.id logically (no FK due to partitioning)
    role: varchar({ enum: roleEnum }).notNull().default('member'),
    rejectedAt: timestamp({ mode: 'string' }),
    remindedAt: timestamp({ mode: 'string' }),
    createdBy: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    organizationId: uuid().notNull(),
    ...membershipChannelColumns(),
  },
  (table) => [
    index('inactive_memberships_user_id_idx').on(table.userId),
    index('inactive_memberships_created_by_idx').on(table.createdBy),
    index('inactive_memberships_tenant_id_idx').on(table.tenantId),
    index('inactive_memberships_email_idx').on(table.email),
    index('inactive_memberships_org_pending_idx').on(table.organizationId, table.rejectedAt),
    unique('inactive_memberships_tenant_email_ctx').on(table.tenantId, table.email, table.channelId),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
  ],
);

export type InactiveMembershipModel = typeof inactiveMembershipsTable.$inferSelect;
export type InsertInactiveMembershipModel = typeof inactiveMembershipsTable.$inferInsert;
