import '#/modules'; // composition root: register modules so seed writes fire their mutation handlers
import { appConfig } from 'shared';
import { checkMark, durationSuffix } from '#/utils/console';
import { migrateDatabase } from './db/migrate-database';
import { seedScripts } from './scripts-discovery';

const isProduction = appConfig.mode === 'production';
const startedAt = performance.now();

// Run all seeds, or a specific one if a target is provided (eg `pnpm seed user`)
const target = process.argv[2];
const seedNames = seedScripts.map((s) => s.name);

if (target && !seedNames.includes(target)) {
  console.error(`Unknown seed: "${target}". Available: ${seedNames.join(', ')}`);
  process.exit(1);
}

const toRun = target ? seedScripts.filter((s) => s.name === target) : seedScripts.filter((s) => !s.explicit);

// Before anything writes: a seed that refuses this database stops the run before the migrations touch it
for (const seed of toRun) {
  try {
    seed.precheck?.();
  } catch (error) {
    console.error(`Refusing seed "${seed.name}": ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

const migrateStartedAt = performance.now();
await migrateDatabase('migrations');
console.info(`${checkMark} Migrations applied${durationSuffix(migrateStartedAt)}`);

for (const seed of toRun) {
  if (isProduction && !seed.allowProduction) {
    console.info(`Skipping seed "${seed.name}": not allowed in production.`);
    continue;
  }

  try {
    await seed.run();
  } catch (error) {
    console.error(`Error running seed: ${seed.name}`, error);
    process.exit(1);
  }
}

console.info(`${checkMark} Seed finished${durationSuffix(startedAt)}`);
