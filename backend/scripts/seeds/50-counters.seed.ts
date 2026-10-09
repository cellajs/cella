import { sql } from 'drizzle-orm';
import type { SeedScript } from '../types';
import { getSeedDb } from '#/db/db';
import { recalculateCounters, recalculateViewCounts } from '#/modules/entities/counters-queries';
import { requestBooks } from '#/modules/entities/sync-requests';
import { startSpinner, succeedSpinner } from '#/utils/console';

// Seed scripts use the admin connection for privileged operations.
const db = getSeedDb();

const CDC_SLOT_NAME = process.env.CDC_SLOT_NAME ?? 'cdc_slot';

/**
 * Makes the counters match the seeded rows. Whoever reads the replication slot owns the channel counters:
 * - no slot: no CDC worker has read this database, so the seed recounts them itself. A worker that starts later makes
 *   its slot at the current position and never sees the seed's rows.
 * - a slot: the worker receives the seed's rows as changes and counts them. The seed only asks it to rebuild its
 *   counters from the tables, which it does within seconds, or at its next start when it is not running.
 * View counts are the API's own and are recounted here in both cases.
 */
export const countersSeed = async () => {
  startSpinner('Recalculating counters...');

  const { productRows } = await recalculateViewCounts({ var: { db } });
  const slot = await db.execute(sql`SELECT 1 FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`);

  if (slot.rows.length > 0) {
    await requestBooks(db, 'rebuild');
    succeedSpinner(`Asked the CDC worker to rebuild its counters; recounted the view counts of ${productRows} product entities`);
    return;
  }

  const { channelRows } = await db.transaction((tx) => recalculateCounters({ var: { db: tx } }));
  succeedSpinner(`Recalculated counters for ${channelRows} channel entities, ${productRows} product entities`);
};

export const seedConfig: SeedScript = { name: 'counters', run: countersSeed, allowProduction: true };
