import { sql } from 'drizzle-orm';
import type { SeedScript } from '../types';
import { getSeedDb } from '#/db/db';
import { recalculateCounters } from '#/modules/entities/helpers/recalculate-counters';
import { startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';

// Seed scripts use the admin connection for privileged operations.
const db = getSeedDb();

const CDC_SLOT_NAME = process.env.CDC_SLOT_NAME ?? 'cdc_slot';
const CDC_CATCHUP_TIMEOUT_MS = 30_000;
const CDC_CATCHUP_POLL_MS = 500;

const readSlot = async (targetLsn: string) => {
  const result = await db.execute(sql`
    SELECT active, confirmed_flush_lsn >= ${targetLsn}::pg_lsn AS caught_up
    FROM pg_replication_slots
    WHERE slot_name = ${CDC_SLOT_NAME}
  `);
  return (result.rows[0] as { active: boolean; caught_up: boolean | null } | undefined) ?? null;
};

/**
 * CDC counter deltas are pure increments, so recalculating while seed WAL is still pending in the
 * replication slot double-counts: recalculation writes the true count, then the worker replays the
 * seed inserts and increments on top. Settle the slot first so recalculation is the authority:
 * - no slot: the worker creates one at current WAL on startup, so seed events never replay.
 * - idle slot: advance it past the seed WAL; the pending events are skipped for good.
 * - active slot: wait for the worker to flush past the seed WAL, then recalculate over its work.
 * Never fails the seed: on timeout or missing privilege it warns and proceeds.
 */
const settleCdcSlot = async () => {
  try {
    const lsnResult = await db.execute(sql`SELECT pg_current_wal_lsn()::text AS lsn`);
    const targetLsn = (lsnResult.rows[0] as { lsn: string }).lsn;

    let slot = await readSlot(targetLsn);
    if (!slot) return;

    if (!slot.active && !slot.caught_up) {
      try {
        await db.execute(sql`SELECT pg_replication_slot_advance(${CDC_SLOT_NAME}, pg_current_wal_lsn())`);
        return;
      } catch {
        // The worker attached between the checks; fall through to waiting for it.
      }
    }

    const deadline = Date.now() + CDC_CATCHUP_TIMEOUT_MS;
    while (slot && !slot.caught_up && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, CDC_CATCHUP_POLL_MS));
      slot = await readSlot(targetLsn);
    }

    if (slot && !slot.caught_up) {
      warnSpinner(
        `CDC slot '${CDC_SLOT_NAME}' still behind after ${CDC_CATCHUP_TIMEOUT_MS / 1000}s; replayed events will drift the counters. Re-run "pnpm seed counters" once the worker has caught up.`,
      );
    }
  } catch (error) {
    warnSpinner(
      `Could not settle CDC slot '${CDC_SLOT_NAME}' before recalculating: ${error instanceof Error ? error.message : String(error)}`,
    );
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
