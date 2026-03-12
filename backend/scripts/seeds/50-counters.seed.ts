import type { SeedScript } from '../types';
import { migrationDb } from '#/db/db';
import { recalculateContextCounters } from '#/modules/entities/helpers/recalculate-context-counters';
import { startSpinner, succeedSpinner } from '#/utils/console';

// Seed scripts use admin connection (migrationDb) for privileged operations
const db = migrationDb;

/**
 * Recalculate context_counters from current database state.
 *
 * Delegates to recalculateContextCounters() which uses ON CONFLICT with || merge,
 * so it's safe to run even when rows already exist (e.g. pre-populated by triggers).
 * Always runs — never skips.
 */
export const countersSeed = async () => {
  const spinner = startSpinner('Recalculating context counters...');

  if (!db) {
    spinner.fail('DATABASE_ADMIN_URL required for seeding');
    return;
  }

  const count = await recalculateContextCounters(db);

  succeedSpinner(`Recalculated context counters for ${count} contexts`);
};

export const seedConfig: SeedScript = { name: 'counters', run: countersSeed };
