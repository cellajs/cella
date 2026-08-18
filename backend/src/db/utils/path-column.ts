import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/pg-core';
import { type ChannelEntityType, hierarchy } from 'shared';

/** Root-first ID path; CDC mirrors it onto `channel_counters.path` for catchup prefix verification. */
export const channelPathColumn = (entityType: ChannelEntityType) => ({
  path: text('path').generatedAlwaysAs(sql.raw(hierarchy.pathColumnSql(entityType, true))),
});
