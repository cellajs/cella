import { index, jsonb, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { auditColumns } from '#/db/utils/audit-columns';
import { membershipChannelColumns } from '#/db/utils/channel-relation-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { ServiceAccountId } from '#/db/utils/ids';
import { organizationForeignKey } from '#/db/utils/organization-foreign-key';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/**
 * An LTI tool placed in a channel: a resource link, whose id is the LTI `resource_link.id`. It goes with its channel
 * (the organization foreign key and the channel id columns below it) and with its installation. A tenant table read
 * through queries, outside RLS like memberships: the organization scope of a request is its isolation.
 */
export const ltiResourceLinksTable = snakeCase.table(
  'lti_resource_links',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    organizationId: uuid().notNull(),
    channelType: varchar({ enum: appConfig.channelEntityTypes }).notNull(),
    channelId: uuid().notNull(),
    ...membershipChannelColumns(),
    installationId: uuid()
      .notNull()
      .references(() => serviceAccountsTable.id, { onDelete: 'cascade' })
      .$type<ServiceAccountId>(),
    title: varchar({ length: maxLength.field }).notNull(),
    /** Sent in the launch's `custom` claim over the LTI tool's own custom parameters; every value a string. */
    custom: jsonb().$type<Record<string, string>>().notNull().default({}),
    ...auditColumns(),
  },
  (table) => [
    index('lti_resource_links_channel_id_idx').on(table.channelId),
    index('lti_resource_links_installation_id_idx').on(table.installationId),
    organizationForeignKey(table),
  ],
);

export type LtiResourceLinkModel = typeof ltiResourceLinksTable.$inferSelect;
