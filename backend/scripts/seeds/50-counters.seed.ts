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

interface SlotProgress {
  active: boolean;
  caughtUp: boolean;
  behindBytes: bigint;
  behindPretty: string;
}

const readSlot = async (targetLsn: string): Promise<SlotProgress | null> => {
  const result = await db.execute(sql`
    SELECT active,
      confirmed_flush_lsn >= ${targetLsn}::pg_lsn AS caught_up,
      pg_wal_lsn_diff(${targetLsn}::pg_lsn, confirmed_flush_lsn)::text AS behind_bytes,
      pg_size_pretty(pg_wal_lsn_diff(${targetLsn}::pg_lsn, confirmed_flush_lsn)) AS behind_pretty
    FROM pg_replication_slots
    WHERE slot_name = ${CDC_SLOT_NAME}
  `);
  const row = result.rows[0] as
    | { active: boolean; caught_up: boolean | null; behind_bytes: string | null; behind_pretty: string | null }
    | undefined;
  if (!row) return null;
  return {
    active: row.active,
    caughtUp: row.caught_up ?? false,
    behindBytes: BigInt(row.behind_bytes ?? 0),
    behindPretty: row.behind_pretty ?? 'unknown',
  };
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

    let leastBehind: bigint | null = null;
    let lastProgressAt = Date.now();

    while (true) {
      const slot = await readSlot(targetLsn);
      if (!slot || slot.caughtUp) return;

      if (!slot.active) {
        try {
          await db.execute(sql`SELECT pg_replication_slot_advance(${CDC_SLOT_NAME}, pg_current_wal_lsn())`);
          return;
        } catch {
          // The worker attached between the checks; keep waiting for it.
        }
      }

      if (leastBehind === null || slot.behindBytes < leastBehind) {
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
