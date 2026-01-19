import { appConfig } from 'config';
import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityIdColumns } from '#/db/utils/generate-context-entity-columns';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';
import { tokensTable } from './tokens';

const roleEnum = appConfig.roles.entityRoles;

const { organizationId, ...otherEntityIdColumns } = generateContextEntityIdColumns();

/**
 * Inactive memberships table to track memberships that have are pending (invitations) or rejected.
 * They are a subset of the membershipsTable columns, and include email and rejectedAt fields to track
 * the status of the inactive membership.
 */
export const inactiveMembershipsTable = pgTable(
  'inactive_memberships',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar().primaryKey().$defaultFn(nanoid),
    contextType: varchar({ enum: appConfig.contextEntityTypes }).notNull(),
    email: varchar().notNull(),
    userId: varchar().references(() => usersTable.id, { onDelete: 'cascade' }),
    tokenId: varchar().references(() => tokensTable.id, { onDelete: 'set null' }),
    role: varchar({ enum: roleEnum }).notNull().default('member'),
    rejectedAt: timestamp({ mode: 'string' }),
    createdBy: varchar()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    // Context entity columns
    organizationId: organizationId.notNull(),
    ...otherEntityIdColumns,
    uniqueKey: varchar().unique().notNull(),
  },
  (table) => [
    index('inactive_memberships_user_id_idx').on(table.userId),
    index('inactive_memberships_organization_id_idx').on(table.organizationId),
    index('inactive_memberships_email_idx').on(table.email),
    // Composite index for pending invite count queries
    index('inactive_memberships_org_pending_idx').on(table.organizationId, table.rejectedAt),
  ],
);

export type InactiveMembershipModel = typeof inactiveMembershipsTable.$inferSelect;
export type InsertInactiveMembershipModel = typeof inactiveMembershipsTable.$inferInsert;
