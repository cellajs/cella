import { index, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { auditColumns } from '#/db/utils/audit-columns';
import { membershipChannelColumns } from '#/db/utils/channel-relation-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { organizationForeignKey } from '#/db/utils/organization-foreign-key';
import { connectionsTable } from '#/modules/connections/connections-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/**
 * An LTI context (a course) of a connected platform and the channel it became: one row per context of a connection,
 * written by the launch that maps it. It goes with its connection and with its channel (the organization foreign key
 * and the channel id columns below it). A tenant table read through queries, outside RLS like memberships.
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
