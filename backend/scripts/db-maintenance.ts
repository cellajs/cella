/**
 * Database maintenance CLI — pg_partman partition maintenance.
 *
 * Thin wrapper around `runDbMaintenance` in `src/lib/db-maintenance.ts`. The same logic also
 * runs in-process on a daily schedule (see `scheduleDbMaintenance`), so this script is only
 * needed for ad-hoc runs or when driving maintenance from an external scheduler.
 *
 * Usage:
 *   pnpm --filter backend db:maintenance
 *
 * Schedule in production (optional — the server already schedules it in-process):
 *   Run daily at 03:00 UTC: 0 3 * * *
 */

import pc from 'picocolors';
import { runDbMaintenance } from '#/lib/db-maintenance';

const checkMark = pc.greenBright('✓');
const crossMark = pc.redBright('✗');

async function main(): Promise<void> {
  console.info(' ');
  console.info(pc.bold('Database Maintenance'));
  console.info('=====================');
  console.info(' ');

  try {
    await runDbMaintenance((msg) => console.info(`${checkMark} ${msg}`));

    console.info(' ');
    console.info(`${checkMark} Database maintenance completed successfully`);
    console.info(' ');
    process.exit(0);
  } catch (error) {
    console.error(`${crossMark} Database maintenance failed:`, error);
    process.exit(1);
  }
}

main();
