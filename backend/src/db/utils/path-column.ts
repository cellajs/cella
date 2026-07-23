import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/pg-core';
import { type ChannelEntityType, hierarchy, type ProductEntityType } from 'shared';

/**
 * Stored root-first ID path columns. The SQL expression comes from the hierarchy's
 * `pathColumnSql`, the twin of `shared/src/config-builder/row-path.ts`.
 */

/** Path column for a product entity table (ancestor chain only). */
export const productPathColumn = (entityType: ProductEntityType) => ({
  path: text('path').generatedAlwaysAs(sql.raw(hierarchy.pathColumnSql(entityType, false))),
});

/** Path column for a channel entity table (ancestor chain + own id). */
export const channelPathColumn = (entityType: ChannelEntityType) => ({
  path: text('path').generatedAlwaysAs(sql.raw(hierarchy.pathColumnSql(entityType, true))),
});
