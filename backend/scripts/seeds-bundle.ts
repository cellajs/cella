import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { migrateConfig, migrationDb } from '#/db/db';
import { appConfig } from 'shared';
import { createDbRoles } from './db/create-db-roles';
import type { SeedScript } from './types';

// Production-safe seeds only, avoiding devDependency imports like @faker-js/faker.
import { seedConfig as initSeed } from './seeds/00-init.seed';

const seedScripts: SeedScript[] = [initSeed];

const isProduction = appConfig.mode === 'production';

if (!migrationDb) {
  console.error('DATABASE_ADMIN_URL required for migrations');
  process.exit(1);
}

// Create db roles before applying migrations.
await createDbRoles();

// Apply migrations with the admin connection so RLS grants succeed.
await migrate(migrationDb, migrateConfig);

// Run all seeds, or a specific one when a target is provided.
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

process.exit(0);
