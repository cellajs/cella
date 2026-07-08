import pc from 'picocolors';
import { logMigrationResult, resolveSqlContent, upsertMigration } from './migrations/helpers/drizzle-utils';

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
