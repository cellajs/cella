import { index, integer, primaryKey, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { auditColumns } from '#/db/utils/audit-columns';
import { membershipChannelColumns } from '#/db/utils/channel-relation-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { organizationForeignKey } from '#/db/utils/organization-foreign-key';
import { isoTimestamp } from '#/db/utils/timestamp-columns';
import { connectionsTable } from '#/modules/connections/connections-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/**
 * Why the last member import of a context stopped short, in fixed words: the connection holds no key and must register
 * again, the app refused an address the platform names, the platform refused the scope, the token or the member list,
 * the import failed and is tried again or was tried for the last time, the platform listed more people than an import
 * reads, the tenant's member limit left people out, the app's role mapping gave some people no role and left them out
 * (`no_role`), or the connection, the tenant or the channel is not active. Or that no import ran: it waits until its
 * connection's hourly budget of contexts frees up.
 */
export const ltiImportIssues = [
  'waiting',
  'register_again',
  'address_refused',
  'scope_not_granted',
  'token_refused',
  'members_refused',
  'retrying',
  'failed',
  'too_many_members',
  'member_limit',
  'no_role',
  'inactive',
] as const;
export type LtiImportIssue = (typeof ltiImportIssues)[number];

/**
 * An LTI context of a platform, such as a course, and the channel it became: one row per tenant, issuer and context, written by
 * the launch that maps it and by the member import that reads its people. A new registration of the same platform in
 * the tenant takes the row over: its launches find the channel again. It goes with its channel (the organization
 * foreign key and the channel id columns below it). A tenant table read through queries, outside RLS like memberships.
 */
export const ltiContextsTable = snakeCase.table(
  'lti_contexts',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    organizationId: uuid().notNull(),
    /** The platform's issuer: a context id is unique only within it. */
    issuer: varchar({ length: maxLength.field }).notNull(),
    /** The connection that launched it last; null once that connection is deleted, until another one launches it. */
    connectionId: uuid().references(() => connectionsTable.id, { onDelete: 'set null' }),
    /** The platform's context id, at most 255 characters (LTI Core 1.3, section 5.4.1). */
    contextId: varchar({ length: maxLength.field }).notNull(),
    label: varchar({ length: maxLength.field }),
    title: varchar({ length: maxLength.field }),
    /** The LIS context types the platform sends (`lisContextTypes`); empty when it sends none. */
    types: varchar({ length: maxLength.field }).array().notNull().default([]),
    channelType: varchar({ enum: appConfig.channelEntityTypes }).notNull(),
    channelId: uuid().notNull(),
    /** Where the platform lists the context's members (NRPS), from the last launch that named one the app trusts; null before. */
    membershipsUrl: varchar({ length: maxLength.url }),
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
    uniqueIndex('lti_contexts_tenant_id_issuer_context_id_idx').on(table.tenantId, table.issuer, table.contextId),
    index('lti_contexts_connection_id_idx').on(table.connectionId),
    index('lti_contexts_channel_id_idx').on(table.channelId),
    organizationForeignKey(table),
  ],
);

export type LtiContextModel = typeof ltiContextsTable.$inferSelect;
export type InsertLtiContextModel = typeof ltiContextsTable.$inferInsert;

/**
 * The memberships an LTI context gave: one a launch or an import of the context made, and one another context gave
 * that this one admits too. A membership given another way, such as by an invitation, holds no row and no import ends
 * it. A row goes with its context or its membership. `updatedAt`, or `createdAt` before a second write, is when a
 * launch or an import of the context last admitted the person: a complete read ends only the rows not written since
 * it began.
 */
export const ltiContextMembershipsTable = snakeCase.table(
  'lti_context_memberships',
  {
    contextId: uuid()
      .notNull()
      .references(() => ltiContextsTable.id, { onDelete: 'cascade' }),
    membershipId: uuid()
      .notNull()
      .references(() => membershipsTable.id, { onDelete: 'cascade' }),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.contextId, table.membershipId] }),
    index('lti_context_memberships_membership_id_idx').on(table.membershipId),
  ],
);
