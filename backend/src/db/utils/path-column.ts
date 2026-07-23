import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/pg-core';
import { type ChannelEntityType, hierarchy } from 'shared';

/**
 * Stored root-first ID path column for channel tables, the canonical ancestry that CDC
 * mirrors onto `channel_counters.path` for catchup prefix verification. The SQL expression
 * comes from the hierarchy's `pathColumnSql`, the twin of the JS path rule. Product rows
 * carry no stored path: their location is computed from ancestor id columns where needed
 * (CDC batching, move detection, stream notifications).
 */
export const channelPathColumn = (entityType: ChannelEntityType) => ({
  path: text('path').generatedAlwaysAs(sql.raw(hierarchy.pathColumnSql(entityType, true))),
});
