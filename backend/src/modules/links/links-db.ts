import { snakeCase, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { channelCodeLength } from 'shared/share-link';
import { tenantIdLength } from '#/db/utils/constraints';
import { isoTimestamp } from '#/db/utils/timestamp-columns';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/**
 * Every channel code ever handed out, across channel types: the code a share link starts with and the channel it
 * names. `next_channel_code()` is its only writer. A row outlives its channel, so a code is never handed out twice.
 */
export const channelCodesTable = snakeCase.table(
  'channel_codes',
  {
    code: varchar({ length: channelCodeLength }).primaryKey(),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    channelType: varchar({ enum: appConfig.channelEntityTypes }).notNull(),
    channelId: uuid().notNull(),
    createdAt: isoTimestamp().defaultNow().notNull(),
  },
  (table) => [uniqueIndex('channel_codes_channel_id_unique').on(table.channelId)],
);
