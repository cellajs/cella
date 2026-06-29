/**
 * Bundleable seed runner — static imports instead of dynamic discovery.
 *
 * Used as a tsup entry point so seeds can run inside production containers
 * with just `node dist/seeds-bundle.js <target>` (no tsx/pnpm needed).
 *
 * Only includes production-safe seeds (allowProduction: true) to avoid
 * bundling devDependencies like @faker-js/faker. For dev seeds, use
 * `tsx scripts/seeds.ts` locally.
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { migrateConfig, migrationDb } from '#/db/db';
import { appConfig } from 'shared';
import { createDbRoles } from './db/create-db-roles';
import type { SeedScript } from './types';

// Only production-safe seeds (avoids devDependency imports like @faker-js/faker)
import { seedConfig as initSeed } from './seeds/00-init.seed';

const seedScripts: SeedScript[] = [initSeed];

const isProduction = appConfig.mode === 'production';

if (!migrationDb) {
  console.error('DATABASE_ADMIN_URL required for migrations');
  process.exit(1);
}

// Create db roles first
await createDbRoles();

// Migrate db using admin connection (applies RLS grants)
await migrate(migrationDb, migrateConfig);

// Run all seeds, or a specific one if a target is provided (eg `node dist/seeds-bundle.js init`)
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
