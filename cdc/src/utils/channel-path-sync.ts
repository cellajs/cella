import { sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { PendingEvent } from '../types';

const channelTypes: Set<string> = new Set(appConfig.channelEntityTypes);

/**
 * Mirror channel rows' canonical id-path (STORED generated column, present in WAL images)
 * onto their channel_counters row. Reparents ride the same pipeline as counter updates;
 * recalc backfills. Delete events are skipped: the counters row dies with the channel.
 */
export async function syncChannelPaths(events: PendingEvent[]): Promise<void> {
  const paths = new Map<string, string>();
  for (const { result } of events) {
    const { tableMeta, activity, rowData } = result;
    if (tableMeta.kind !== 'entity' || !channelTypes.has(tableMeta.type)) continue;
    if (activity.action === 'delete') continue;
    if (typeof rowData.id === 'string' && typeof rowData.path === 'string') paths.set(rowData.id, rowData.path);
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
