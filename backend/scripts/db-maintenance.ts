/**
 * Database maintenance script for token/session cleanup.
 *
 * This script can be run in two modes:
 * 1. With pg_partman (production): Runs partman.run_maintenance() to manage partitions
 * 2. Without pg_partman (dev/PGlite): Runs manual DELETE queries for expired data
 *
 * Usage:
 *   pnpm tsx backend/scripts/db-maintenance.ts
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 *
 * Schedule this in production using a cron job (e.g., Render Cron Job):
 *   Run daily at 03:00 UTC: 0 3 * * *
 */

import { sql } from 'drizzle-orm';
import pc from 'picocolors';
import { db } from '#/db/db';

const checkMark = pc.greenBright('✓');
const crossMark = pc.redBright('✗');

/**
 * Check if pg_partman extension is available.
 */
async function isPgPartmanAvailable(): Promise<boolean> {
  try {
    const result = await db.execute<{ exists: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_partman') as exists`,
    );
    return result.rows[0]?.exists ?? false;
  } catch {
    return false;
  }
}

/**
 * Run pg_partman maintenance for all configured partition sets.
 */
async function runPartmanMaintenance(): Promise<void> {
  console.info('Running pg_partman maintenance...');

  // Run maintenance for all tables
  await db.execute(sql`SELECT partman.run_maintenance()`);

  console.info(`${checkMark} pg_partman maintenance completed`);
}

/**
 * Manual cleanup for environments without pg_partman.
 * Deletes expired tokens and sessions based on their expiration/creation timestamps.
 */
async function runManualCleanup(): Promise<void> {
  console.info('Running manual cleanup (pg_partman not available)...');

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Delete expired tokens (30-day buffer after expiration)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const tokensResult = await db.execute<{ count: string }>(
    sql`DELETE FROM tokens WHERE expires_at < ${thirtyDaysAgo} RETURNING 1`,
  );
  const tokensDeleted = tokensResult.rowCount ?? 0;
  console.info(`${checkMark} Deleted ${tokensDeleted} expired tokens`);

  // Delete expired sessions (30-day buffer after expiration)
  const sessionsResult = await db.execute<{ count: string }>(
    sql`DELETE FROM sessions WHERE expires_at < ${thirtyDaysAgo} RETURNING 1`,
  );
  const sessionsDeleted = sessionsResult.rowCount ?? 0;
  console.info(`${checkMark} Deleted ${sessionsDeleted} expired sessions`);

  // Delete old unsubscribe tokens (90-day retention)
  const unsubscribeResult = await db.execute<{ count: string }>(
    sql`DELETE FROM unsubscribe_tokens WHERE created_at < ${ninetyDaysAgo} RETURNING 1`,
  );
  const unsubscribeDeleted = unsubscribeResult.rowCount ?? 0;
  console.info(`${checkMark} Deleted ${unsubscribeDeleted} old unsubscribe tokens`);

  console.info(`${checkMark} Manual cleanup completed`);
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  console.info(' ');
  console.info(pc.bold('Database Maintenance'));
  console.info('=====================');
  console.info(' ');

  try {
    const hasPartman = await isPgPartmanAvailable();

    if (hasPartman) {
      console.info('pg_partman detected - using partition management');
      await runPartmanMaintenance();
    } else {
      console.info('pg_partman not available - using manual cleanup');
      await runManualCleanup();
    }

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
