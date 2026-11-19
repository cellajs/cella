import { index, integer, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { auditColumns } from '#/db/utils/audit-columns';
import { membershipChannelColumns } from '#/db/utils/channel-relation-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { organizationForeignKey } from '#/db/utils/organization-foreign-key';
import { isoTimestamp } from '#/db/utils/timestamp-columns';
import { connectionsTable } from '#/modules/connections/connections-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/**
 * Why the last member import of a context stopped short, in fixed words: the platform refused the scope, the token or
 * the member list, a read failed (and is retried), the platform listed more people than an import reads, or the
 * tenant's member limit refused the next person.
 */
const ltiImportIssues = ['scope_not_granted', 'token_refused', 'members_refused', 'read_failed', 'too_many_members', 'member_limit'] as const;
export type LtiImportIssue = (typeof ltiImportIssues)[number];

/**
 * An LTI context (a course) of a connected platform and the channel it became: one row per context of a connection,
 * written by the launch that maps it and by the member import that reads its people. It goes with its connection and
 * with its channel (the organization foreign key and the channel id columns below it). A tenant table read through
 * queries, outside RLS like memberships.
 */
export const ltiContextsTable = snakeCase.table(
  'lti_contexts',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    organizationId: uuid().notNull(),
    connectionId: uuid()
      .notNull()
      .references(() => connectionsTable.id, { onDelete: 'cascade' }),
    /** The platform's context id, at most 255 characters (LTI Core 1.3, section 5.4.1). */
    contextId: varchar({ length: maxLength.field }).notNull(),
    label: varchar({ length: maxLength.field }),
    title: varchar({ length: maxLength.field }),
    /** The LIS context types the platform sends (`lisContextTypes`); empty when it sends none. */
    types: varchar({ length: maxLength.field }).array().notNull().default([]),
    channelType: varchar({ enum: appConfig.channelEntityTypes }).notNull(),
    channelId: uuid().notNull(),
    /** The platform's API for the installation's token, from the last launch that named one the app trusts; null before. */
    apiUrl: varchar({ length: maxLength.url }),
    /** The first page of the context's members at the platform, under `apiUrl`; set with it. */
    membersUrl: varchar({ length: maxLength.url }),
    /** When the last member import ran; null before the first. */
    importRanAt: isoTimestamp(),
    /** How many people the last member import read from the platform. */
    importReadCount: integer(),
    /** Null when the last member import read and wrote everyone. */
    importIssue: varchar({ enum: ltiImportIssues }),
    ...membershipChannelColumns(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex('lti_contexts_connection_id_context_id_idx').on(table.connectionId, table.contextId),
    index('lti_contexts_channel_id_idx').on(table.channelId),
    organizationForeignKey(table),
  ],
);

export type LtiContextModel = typeof ltiContextsTable.$inferSelect;
export type InsertLtiContextModel = typeof ltiContextsTable.$inferInsert;
