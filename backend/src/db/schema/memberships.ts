import { boolean, doublePrecision, index, pgTable, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { usersTable } from '#/db/schema/users';
import { generateContextEntityIdColumns } from '#/db/utils/generate-context-entity-columns';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const roleEnum = appConfig.entityRoles;

const { organizationId, ...otherEntityIdColumns } = generateContextEntityIdColumns();

/**
 * Memberships table to track active memberships of users in organizations and other context entities.
 */
export const membershipsTable = pgTable(
  'memberships',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar().primaryKey().$defaultFn(nanoid),
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
    uniqueKey: varchar().unique().notNull(),
  },
  (table) => [
    index('memberships_user_id_idx').on(table.userId),
    index('memberships_organization_id_idx').on(table.organizationId),
    // Composite index for count queries by context type
    index('memberships_context_org_role_idx').on(table.contextType, table.organizationId, table.role),
  ],
);

export type MembershipModel = typeof membershipsTable.$inferSelect;
export type InsertMembershipModel = typeof membershipsTable.$inferInsert;
