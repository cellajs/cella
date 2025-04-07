import { execSync } from 'node:child_process';
import { config } from 'config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, migrateConfig } from '#/db/db';
import { env } from '#/env';

if (env.PGLITE) {
  console.info(' ');
  console.info('Database seeding skipped: The database is automatically populated when QUICK mode starts.');
  console.info(' ');
  process.exit(0);
}

// Migrate db
await migrate(db, migrateConfig);

for (const cmd of config.seedScripts) {
  try {
    // Execute the command
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing command: ${cmd}`, error);
    process.exit(1);
  }
}
