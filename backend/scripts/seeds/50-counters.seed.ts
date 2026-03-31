import type { SeedScript } from '../types';
import { seedDb } from '#/db/db';
import { recalculateCounters } from '#/modules/entities/helpers/recalculate-counters';
import { startSpinner, succeedSpinner } from '#/utils/console';

// Seed scripts use admin connection for privileged operations
const db = seedDb;

/**
 * Recalculate context_counters and product_counters from current database state.
 *
 * Delegates to recalculateCounters() which uses ON CONFLICT with || merge,
 * so it's safe to run even when rows already exist (e.g. pre-populated by triggers).
 * Always runs — never skips.
 */
export const countersSeed = async () => {
  startSpinner('Recalculating counters...');

  const { contextCount, productCount } = await recalculateCounters(db);

  succeedSpinner(`Recalculated counters: ${contextCount} context, ${productCount} product`);
};

export const seedConfig: SeedScript = { name: 'counters', run: countersSeed };
