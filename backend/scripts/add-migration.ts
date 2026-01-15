/**
 * Add Custom SQL Migration Script
 *
 * This script adds a custom SQL migration to Drizzle's migration folder and journal.
 * It handles both creating new migrations and updating existing ones with the same tag.
 *
 * Usage:
 *   pnpm add-migration <tag> <sql-file-or-string>
 *
 * Examples:
 *   # From SQL file:
 *   pnpm add-migration activity_notify_trigger ./sql/trigger.sql
 *
 *   # From inline SQL (use quotes):
 *   pnpm add-migration my_index "CREATE INDEX my_idx ON users(email);"
 *
 * The migration will be automatically applied with other Drizzle migrations.
 */

import pc from 'picocolors';
import { logMigrationResult, resolveSqlContent, upsertMigration } from './lib/drizzle-migration';

// CLI entry point
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error(pc.bold(pc.redBright('Usage: pnpm add-migration <tag> <sql-file-or-string>')));
  console.error('');
  console.error('Examples:');
  console.error('  pnpm add-migration activity_notify ./sql/trigger.sql');
  console.error('  pnpm add-migration my_index "CREATE INDEX idx ON users(email);"');
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
