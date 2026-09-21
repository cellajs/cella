import { sql } from 'drizzle-orm';
import type { SeedScript } from '../types';
import { getSeedDb } from '#/db/db';
import { recalculateCounters } from '#/modules/entities/helpers/recalculate-counters';
import { noteSpinnerWarning, startSpinner, succeedSpinner, updateSpinner } from '#/utils/console';

// Seed scripts use the admin connection for privileged operations.
const db = getSeedDb();

const CDC_SLOT_NAME = process.env.CDC_SLOT_NAME ?? 'cdc_slot';
/** Gives up once the slot made no progress for this long; a worker that keeps flushing is waited out. */
const CDC_STALL_TIMEOUT_MS = 30_000;
const CDC_CATCHUP_POLL_MS = 500;

/** How far the slot still is from the target position. */
const readSlot = async (targetLsn: string) => {
  const result = await db.execute<{ active: boolean; behindBytes: number; behindPretty: string }>(sql`
    SELECT active,
      pg_wal_lsn_diff(${targetLsn}::pg_lsn, confirmed_flush_lsn)::float8 AS "behindBytes",
      pg_size_pretty(pg_wal_lsn_diff(${targetLsn}::pg_lsn, confirmed_flush_lsn)) AS "behindPretty"
    FROM pg_replication_slots
    WHERE slot_name = ${CDC_SLOT_NAME}
  `);
  return result.rows[0] ?? null;
};

/**
 * CDC counter deltas are pure increments, so recalculating while seed WAL is still pending in the
 * replication slot double-counts: recalculation writes the true count, then the worker replays the
 * seed inserts and increments on top. Settle the slot first so recalculation is the authority:
 * - no slot: the worker creates one at current WAL on startup, so seed events never replay.
 * - idle slot: advance it past the seed WAL; the pending events are skipped for good.
 * - active slot: wait while the worker keeps flushing toward the seed WAL, then recalculate over its work.
 * Never fails the seed: on a stalled slot or missing privilege it warns and proceeds.
 */
const settleCdcSlot = async () => {
  try {
    const lsnResult = await db.execute(sql`SELECT pg_current_wal_lsn()::text AS lsn`);
    const targetLsn = (lsnResult.rows[0] as { lsn: string }).lsn;

    let leastBehind = Number.POSITIVE_INFINITY;
    let lastProgressAt = Date.now();

    while (true) {
      const slot = await readSlot(targetLsn);
      if (!slot || slot.behindBytes <= 0) return;

      if (!slot.active) {
        try {
          await db.execute(sql`SELECT pg_replication_slot_advance(${CDC_SLOT_NAME}, pg_current_wal_lsn())`);
          return;
        } catch {
          // The worker attached between the checks; keep waiting for it.
        }
      }

      if (slot.behindBytes < leastBehind) {
        leastBehind = slot.behindBytes;
        lastProgressAt = Date.now();
        updateSpinner(`Recalculating counters... CDC worker has ${slot.behindPretty} of seed WAL left`);
      } else if (Date.now() - lastProgressAt > CDC_STALL_TIMEOUT_MS) {
        noteSpinnerWarning(
          `CDC slot '${CDC_SLOT_NAME}' made no progress for ${CDC_STALL_TIMEOUT_MS / 1000}s with ${slot.behindPretty} left; replayed events will drift the counters. Re-run "pnpm seed counters" once the worker has caught up.`,
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, CDC_CATCHUP_POLL_MS));
    }
  } catch (error) {
    noteSpinnerWarning(
      `Could not settle CDC slot '${CDC_SLOT_NAME}' before recalculating: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    updateSpinner('Recalculating counters...');
  }
};

/**
 * Recalculate channel_counters and product_counters from current DB state. Delegates to
 * recalculateCounters(), which uses ON CONFLICT with || merge, so it's safe to re-run even
 * when rows already exist (e.g. pre-populated by triggers).
 */
export const countersSeed = async () => {
  startSpinner('Recalculating counters...');

  await settleCdcSlot();
  const { channelRows, productRows } = await recalculateCounters(db);

  succeedSpinner(`Recalculated counters for ${channelRows} channel entities, ${productRows} product entities`);
};

export const seedConfig: SeedScript = { name: 'counters', run: countersSeed, allowProduction: true };
