import { index, jsonb, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ChannelEntityType, EntityRole } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { PrincipalId, ServiceAccountId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { principalsTable } from '#/modules/principals/principals-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

export const serviceAccountStatuses = ['active', 'disabled'] as const;

/**
 * Machine principals: the actor an API key runs as. Tenant-scoped by construction, holds role bindings in `bindings`
 * and is disabled, never deleted, so provenance keeps pointing at it. An auth table outside RLS: the machine guard
 * resolves it before any tenant context exists.
 */
/** One role binding of a service account, the shape the engine and the guards read; stored on the account row. */
export interface RoleBinding {
  channelType: ChannelEntityType;
  channelId: string;
  organizationId: string;
  role: EntityRole;
}

export const serviceAccountsTable = snakeCase.table(
  'service_accounts',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(generateId)
      .references(() => principalsTable.id, { onDelete: 'cascade' })
      .$type<ServiceAccountId>(),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    name: varchar({ length: maxLength.field }).notNull(),
    description: varchar({ length: maxLength.field }),
    status: varchar({ enum: serviceAccountStatuses }).notNull().default('active'),
    bindings: jsonb().$type<RoleBinding[]>().notNull().default([]),
    /** Set when this account is the installation of a registered app in this tenant (D4); its consents hang off it. */
    oauthClientId: varchar({ length: maxLength.field }).references(() => oauthClientsTable.id, { onDelete: 'cascade' }),
    createdBy: uuid()
      .references(() => principalsTable.id, { onDelete: 'set null' })
      .$type<PrincipalId>(),
    /** Who last changed name, description or status; disabling is the security-relevant act here. */
    updatedBy: uuid()
      .references(() => principalsTable.id, { onDelete: 'set null' })
      .$type<PrincipalId>(),
    createdAt: timestampColumns.createdAt,
    updatedAt: timestampColumns.updatedAt,
    lastUsedAt: timestamp({ mode: 'string' }),
  },
  (table) => [index('service_accounts_tenant_id_idx').on(table.tenantId)],
);

export type ServiceAccountModel = typeof serviceAccountsTable.$inferSelect;
export type InsertServiceAccountModel = typeof serviceAccountsTable.$inferInsert;
