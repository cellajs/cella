import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { migrateConfig, migrationDb } from '#/db/db';
import { env } from '#/env';
import { appConfig } from 'shared';
import { createDbRoles } from './db/create-db-roles';
import { seedScripts } from './scripts-config';

const isProduction = appConfig.mode === 'production';

if (env.DEV_MODE === 'basic') {
  console.info(' ');
  console.info('Database seeding skipped: The database is automatically populated when QUICK mode starts.');
  console.info(' ');
  process.exit(0);
}

if (!migrationDb) {
  console.error('DATABASE_ADMIN_URL required for migrations');
  process.exit(1);
}

// Create db roles first
await createDbRoles();

// Migrate db using admin connection (applies RLS grants)
await migrate(migrationDb, migrateConfig);

// Run all seeds, or a specific one if a target is provided (eg `pnpm seed user`)
const target = process.argv[2];
const seedNames = seedScripts.map((s) => s.name);

if (target && !seedNames.includes(target)) {
  console.error(`Unknown seed: "${target}". Available: ${seedNames.join(', ')}`);
  process.exit(1);
}

const toRun = target ? seedScripts.filter((s) => s.name === target) : seedScripts;

for (const seed of toRun) {
  if (isProduction && !seed.allowProduction) {
    console.info(`Skipping seed "${seed.name}" — not allowed in production.`);
    continue;
  }

  try {
    await seed.run();
  } catch (error) {
    console.error(`Error running seed: ${seed.name}`, error);
    process.exit(1);
  }
}
