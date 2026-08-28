import { inArray } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { getEntityTable } from '#/tables';

/** The two columns every channel table has; the table union needs narrowing to select them. */
type NamedTable = AnyPgTable & { id: PgColumn; name: PgColumn };

/**
 * Display names for a set of channel ids, so a digest can group by channel without the caller
 * knowing which table each id lives in.
 *
 * Driven by `appConfig.channelEntityTypes`, so a hierarchy change is picked up automatically. Channel tables sit outside RLS (application-layer guards cover them),
 * and the ids only ever come from rows the recipient was already cleared to read.
 */
export async function findChannelNames(channelIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (channelIds.length === 0) return names;

  const unique = [...new Set(channelIds)];

  await Promise.all(
    appConfig.channelEntityTypes.map(async (channelType) => {
      const table = getEntityTable(channelType) as NamedTable;
      const rows = await baseDb.select({ id: table.id, name: table.name }).from(table).where(inArray(table.id, unique));
      for (const row of rows) names.set(String(row.id), String(row.name));
    }),
  );

  return names;
}
