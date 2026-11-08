import { sql } from 'drizzle-orm';
import { entityIdColumnName } from 'shared';
import type { DbContext } from '#/core/context';
import { channelTables } from '#/db/channel-tables';
import { TTLCache } from '#/lib/ttl-cache';

const cacheKey = (tenantId: string, organizationId: string) => `${tenantId}:${organizationId}`;

const archivedChannelCache = new TTLCache<ReadonlySet<string>>({ maxSize: 5000, defaultTtl: 10_000 });

const noArchivedChannels: ReadonlySet<string> = new Set();

/** Read per call, never at module load, as `channel-tables.ts` asks. */
const tablesBelowOrganization = () =>
  Object.entries(channelTables)
    .filter(([channelType]) => channelType !== 'organization')
    .map(([, table]) => table());

interface LoadArchivedChannelIdsOpts {
  tenantId: string;
  organizationId: string;
}

/**
 * The ids of the organization's archived channels, from cache or one statement over the channel tables below it, cached
 * for 10 seconds. Without a channel type below the organization it is empty and runs no query.
 */
export const loadArchivedChannelIds = (ctx: DbContext, { tenantId, organizationId }: LoadArchivedChannelIdsOpts): Promise<ReadonlySet<string>> => {
  const tables = tablesBelowOrganization();
  if (!tables.length) return Promise.resolve(noArchivedChannels);

  return archivedChannelCache.load(cacheKey(tenantId, organizationId), async () => {
    const organizationColumn = sql.identifier(entityIdColumnName('organization'));
    const selects = tables.map((table) => sql`SELECT id FROM ${table} WHERE ${organizationColumn} = ${organizationId} AND archived = true`);
    const { rows } = await ctx.var.db.execute<{ id: string }>(sql.join(selects, sql` UNION ALL `));
    return new Set(rows.map(({ id }) => id));
  });
};

/** After a channel of the organization is archived or unarchived. */
export const dropArchivedChannelIds = (tenantId: string, organizationId: string): void => {
  archivedChannelCache.delete(cacheKey(tenantId, organizationId));
};
