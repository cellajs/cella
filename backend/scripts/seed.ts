import { execSync } from 'node:child_process';
import { appConfig } from 'config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, migrateConfig } from '#/db/db';
import { env } from '#/env';

if (env.DEV_MODE === 'basic') {
  console.info(' ');
  console.info('Database seeding skipped: The database is automatically populated when QUICK mode starts.');
  console.info(' ');
  process.exit(0);
}

// Migrate db
await migrate(db, migrateConfig);

/**
 * Run seed scripts array from config
 */
for (const cmd of appConfig.seedScripts) {
  try {
    // Execute the command
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing command: ${cmd}`, error);
    process.exit(1);
  }
}
