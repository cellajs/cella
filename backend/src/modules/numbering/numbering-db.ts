import { index, integer, primaryKey, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { tenantIdLength } from '#/db/utils/constraints';
import { organizationForeignKey } from '#/db/utils/organization-foreign-key';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/** The last number handed out per home channel and product type; `assign_product_number()` is its only writer. */
export const productNumberingTable = snakeCase.table(
  'product_numbering',
  {
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    organizationId: uuid().notNull(),
    channelId: uuid().notNull(),
    productType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
    lastNumber: integer().notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.productType] }), organizationForeignKey(table)],
);

/**
 * The numbers rows left behind when they moved to another channel: an old link reads here that its row moved. A row
 * that moves back takes its number again, which `assign_product_number()` reads here before it counts on.
 */
export const productNumberMovesTable = snakeCase.table(
  'product_number_moves',
  {
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id),
    organizationId: uuid().notNull(),
    channelId: uuid().notNull(),
    productType: varchar({ enum: appConfig.productEntityTypes }).notNull(),
    number: integer().notNull(),
    entityId: uuid().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.productType, table.number] }),
    index('product_number_moves_entity_id_index').on(table.entityId),
    organizationForeignKey(table),
  ],
);
