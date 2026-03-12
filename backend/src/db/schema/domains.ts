import { boolean, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { nanoid } from 'shared/nanoid';
import { tenantsTable } from '#/db/schema/tenants';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

/** Domains claimed by tenants. Used for email domain → tenant matching and DNS TXT verification. */
export const domainsTable = pgTable(
  'domains',
  {
    id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    domain: varchar({ length: maxLength.field }).notNull().unique(),
    verified: boolean().notNull().default(false),
    verificationToken: varchar({ length: maxLength.id }).$defaultFn(nanoid),
    verifiedAt: timestamp({ mode: 'string' }),
    lastCheckedAt: timestamp({ mode: 'string' }),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [index('domains_tenant_id_idx').on(table.tenantId), index('domains_domain_idx').on(table.domain)],
);

export type DomainModel = typeof domainsTable.$inferSelect;
export type InsertDomainModel = typeof domainsTable.$inferInsert;
