import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedScript } from './types';
import type { SideEffectProducer } from './types';

/**
 * Auto-discover side-effect producers from scripts/migrations/*.migration.ts files.
 * Each must export a `sideEffect: SideEffectProducer`. Sorted by filename (use numeric prefixes
 * for block order). The schema-diff step (drizzle-kit generate) is a separate first phase in
 * generate.ts, not a discovered producer.
 */
const migrationDir = join(import.meta.dirname, 'migrations');
const migrationFiles = readdirSync(migrationDir).filter((f) => f.endsWith('.migration.ts')).sort();

export const sideEffectProducers: SideEffectProducer[] = [];

for (const file of migrationFiles) {
  const mod = await import(`./migrations/${file.replace('.ts', '')}`);
  if (!mod.sideEffect) throw new Error(`Missing sideEffect export in migrations/${file}`);
  sideEffectProducers.push(mod.sideEffect);
}

/**
 * Auto-discover seed scripts from scripts/seeds/*.seed.ts files.
 * Each must export a `seedConfig: SeedScript`. Sorted by filename (use numeric prefixes for order).
 */
const seedDir = join(import.meta.dirname, 'seeds');
const seedFiles = readdirSync(seedDir).filter((f) => f.endsWith('.seed.ts')).sort();

export const seedScripts: SeedScript[] = [];

for (const file of seedFiles) {
  const mod = await import(`./seeds/${file.replace('.ts', '')}`);
  if (!mod.seedConfig) throw new Error(`Missing seedConfig export in seeds/${file}`);
  seedScripts.push(mod.seedConfig);
}

export type SeedName = string;
