import { index, snakeCase, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig, hierarchy, roles } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { auditColumns } from '#/db/utils/audit-columns';
import { membershipChannelColumns } from '#/db/utils/channel-relation-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { UserId } from '#/db/utils/ids';
import { organizationForeignKey } from '#/db/utils/organization-foreign-key';
import { isoTimestamp } from '#/db/utils/timestamp-columns';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { usersTable } from '#/modules/user/user-db';

/**
 * `held`: made in a draft channel for a role that waits for its publish, never mailed. `pending`: waiting for an
 * answer. `declined`: answered no, which keeps the address from being invited again until the sweep removes the row.
 */
export const invitationStatuses = ['held', 'pending', 'declined'] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

/** Invitations to a channel. Accepting one replaces the row with a membership. */
export const invitationsTable = snakeCase.table(
  'invitations',
  {
    ...auditColumns(),
    id: uuid().primaryKey().$defaultFn(generateId),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    channelType: varchar({ enum: appConfig.channelEntityTypes }).notNull(),
    channelId: uuid().notNull(),
    email: varchar({ length: maxLength.field }).notNull(),
    userId: uuid()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    role: varchar({ enum: roles.all }).notNull().default(hierarchy.getLeastPrivilegedRole('organization')),
    status: varchar({ enum: invitationStatuses }).notNull().default('pending'),
    /** Moved only by a write that changes `status`: the decline's moment for a declined row, which the sweep ages. */
    statusChangedAt: isoTimestamp().defaultNow().notNull(),
    declinedAt: isoTimestamp(),
    /** When the last mail went out; null until the first. */
    mailedAt: isoTimestamp(),
    /** The inviter who made the row, credited in its mails and its membership; `updatedBy` records who raised it. */
    createdBy: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' })
      .$type<UserId>(),
    organizationId: uuid().notNull(),
    ...membershipChannelColumns(),
  },
  (table) => [
    index('invitations_user_id_idx').on(table.userId),
    index('invitations_created_by_idx').on(table.createdBy),
    index('invitations_tenant_id_idx').on(table.tenantId),
    index('invitations_email_idx').on(table.email),
    index('invitations_org_status_idx').on(table.organizationId, table.status),
    unique('invitations_tenant_email_ctx').on(table.tenantId, table.email, table.channelId),
    organizationForeignKey(table),
  ],
);

export type InvitationModel = typeof invitationsTable.$inferSelect;
