import type { SeedScript } from '../types';
import { seedDb } from '#/db/db';
import { recalculateCounters } from '#/modules/entities/helpers/recalculate-counters';
import { startSpinner, succeedSpinner } from '#/utils/console';

// Seed scripts use the admin connection for privileged operations.
const db = seedDb;

/**
 * Recalculate context_counters and product_counters from current database state.
 *
 * Delegates to recalculateCounters() which uses ON CONFLICT with || merge,
 * so it's safe to run even when rows already exist (e.g. pre-populated by triggers).
 * Runs on every seed invocation.
 */
export const countersSeed = async () => {
  startSpinner('Recalculating counters...');

  const { contextRows, productRows } = await recalculateCounters(db);

  succeedSpinner(`Recalculated counters for ${contextRows} context entities, ${productRows} product entities`);
};

export const seedConfig: SeedScript = { name: 'counters', run: countersSeed, allowProduction: true };
