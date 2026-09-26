import { sql } from 'drizzle-orm';
import { appConfig, hierarchy } from 'shared';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { PendingEvent } from '../types';

const channelTypes: Set<string> = new Set(appConfig.channelEntityTypes);

/**
 * Mirrors a channel row's canonical id-path onto its channel_counters row. The path is computed from
 * the row's id columns: the table's `path` is a generated column, which logical replication leaves
 * out of the row image. Deletes are skipped: the counters row dies with the channel.
 */
export async function syncChannelPaths(events: PendingEvent[]): Promise<void> {
  const paths = new Map<string, string>();
  for (const { result } of events) {
    const { tableMeta, activity, rowData } = result;
    if (tableMeta.kind !== 'entity' || !channelTypes.has(tableMeta.type)) continue;
    if (activity.action === 'delete') continue;
    const path = hierarchy.computeChannelPath(tableMeta.type, rowData);
    if (typeof rowData.id === 'string' && path !== null) paths.set(rowData.id, path);
  }
  if (paths.size === 0) return;

  for (const [channelKey, path] of paths) {
    await cdcDb.execute(sql`
      INSERT INTO channel_counters (channel_key, counts, path, updated_at)
      VALUES (${channelKey}, '{}'::jsonb, ${path}, NOW())
      ON CONFLICT (channel_key) DO UPDATE SET path = EXCLUDED.path, updated_at = NOW()
    `);
  }
  log.trace('Channel paths synced', { count: paths.size });
}
