import { index, jsonb, snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { auditColumns } from '#/db/utils/audit-columns';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { ServiceAccountId } from '#/db/utils/ids';
import { actorsTable } from '#/modules/actors/actors-db';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import type { RoleBinding } from '#/modules/service-accounts/service-accounts-schema';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/** `pending`: an installed LTI tool an admin has not approved yet; only its approval or rejection ends that state. */
export const serviceAccountStatuses = ['pending', 'active', 'disabled'] as const;

/**
 * Service accounts: the actor an API key runs as. Tenant-scoped by construction, holds role bindings in `bindings`
 * and is disabled, never deleted: provenance keeps pointing at it. An installed LTI tool's, which writes nothing, goes
 * with its registration. An auth table outside RLS: the machine guard resolves it before any tenant context exists.
 */
export const serviceAccountsTable = snakeCase.table(
  'service_accounts',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(generateId)
      .references(() => actorsTable.id, { onDelete: 'cascade' })
      .$type<ServiceAccountId>(),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    name: varchar({ length: maxLength.field }).notNull(),
    status: varchar({ enum: serviceAccountStatuses }).notNull().default('active'),
    bindings: jsonb().$type<RoleBinding[]>().notNull().default([]),
    /** Set when this account is the installation of a registered app in this tenant, at most one per app; its consents hang off it. */
    oauthClientId: varchar({ length: maxLength.field }).references(() => oauthClientsTable.id, { onDelete: 'cascade' }),
    /**
     * Set when this account is the one an LTI connection writes as, such as its member imports: no admin manages it and
     * it takes no API key. No foreign key: the id stays after the connection's delete, which disables the account.
     */
    connectionId: uuid(),
    // `updatedBy` names who last changed name or status; disabling is the security-relevant act here.
    ...auditColumns(),
  },
  (table) => [
    index('service_accounts_tenant_id_idx').on(table.tenantId),
    uniqueIndex('service_accounts_oauth_client_idx').on(table.tenantId, table.oauthClientId),
    uniqueIndex('service_accounts_connection_id_idx').on(table.connectionId),
  ],
);

export type ServiceAccountModel = typeof serviceAccountsTable.$inferSelect;
export type InsertServiceAccountModel = typeof serviceAccountsTable.$inferInsert;
