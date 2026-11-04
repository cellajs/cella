import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/pg-core';
import { type ChannelEntityType, hierarchy } from 'shared';

/** Root-first ID path, generated from the row's own id and its ancestor id columns. */
export const channelPathColumn = (entityType: ChannelEntityType) => ({
  path: text().generatedAlwaysAs(sql.raw(hierarchy.pathColumnSql(entityType, true))),
});
