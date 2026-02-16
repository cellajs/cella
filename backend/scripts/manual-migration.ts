/**
 * Add Manual SQL Migration Script
 *
 * Adds a custom SQL migration to Drizzle's migration folder and journal.
 * Use this for SQL that can't be auto-generated (triggers, functions, etc.).
 *
 * Usage:
 *   pnpm manual-migration <tag> <sql-file-or-string>
 *
 * Examples:
 *   # From SQL file:
 *   pnpm manual-migration cdc_setup ./sql/cdc-setup.sql
 *
 *   # From inline SQL (use quotes):
 *   pnpm manual-migration my_index "CREATE INDEX my_idx ON users(email);"
 *
 * The migration will be automatically applied with other Drizzle migrations.
 */

import pc from 'picocolors';
import { logMigrationResult, resolveSqlContent, upsertMigration } from './migrations/helpers/drizzle-utils';

// CLI entry point
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error(pc.bold(pc.redBright('Usage: pnpm manual-migration <tag> <sql-file-or-string>')));
  console.error('');
  console.error('Examples:');
  console.error('  pnpm manual-migration activity_notify ./sql/trigger.sql');
  console.error('  pnpm manual-migration my_index "CREATE INDEX idx ON users(email);"');
  process.exit(1);
}

const [tag, sqlOrPath] = args;

try {
  const sql = resolveSqlContent(sqlOrPath);
  const result = upsertMigration(tag, sql);
  logMigrationResult(result);
  console.info('');
} catch (err) {
  console.error(pc.bold(pc.redBright('✘ Failed to add migration:')), err);
  process.exit(1);
}
