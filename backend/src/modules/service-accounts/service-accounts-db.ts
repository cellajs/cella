import { index, jsonb, snakeCase, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import type { ServiceGrant } from '#/core/context';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { principalsTable } from '#/modules/principals/principals-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

export const serviceAccountStatuses = ['active', 'disabled'] as const;

/**
 * Machine principals: the actor an API key runs as. Tenant-scoped by construction, holds role bindings in `grants`
 * and is disabled, never deleted, so provenance keeps pointing at it. An auth table outside RLS: the machine guard
 * resolves it before any tenant context exists.
 */
export const serviceAccountsTable = snakeCase.table(
  'service_accounts',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(generateId)
      .references(() => principalsTable.id, { onDelete: 'cascade' }),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    name: varchar({ length: maxLength.field }).notNull(),
    description: varchar({ length: maxLength.field }),
    status: varchar({ enum: serviceAccountStatuses }).notNull().default('active'),
    grants: jsonb().$type<ServiceGrant[]>().notNull().default([]),
    createdBy: uuid().references(() => principalsTable.id, { onDelete: 'set null' }),
    createdAt: timestampColumns.createdAt,
    updatedAt: timestampColumns.updatedAt,
    lastUsedAt: timestamp({ mode: 'string' }),
  },
  (table) => [index('service_accounts_tenant_id_idx').on(table.tenantId)],
);

export type ServiceAccountModel = typeof serviceAccountsTable.$inferSelect;
export type InsertServiceAccountModel = typeof serviceAccountsTable.$inferInsert;
