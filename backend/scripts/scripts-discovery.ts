import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GenerateScript } from './types';
import type { SeedScript } from './types';

/**
 * Auto-discover generate scripts from scripts/migrations/*.migration.ts files.
 * Each must export a `generateConfig: GenerateScript`. Sorted by filename (use numeric prefixes for order).
 */
const migrationDir = join(import.meta.dirname, 'migrations');
const migrationFiles = readdirSync(migrationDir).filter((f) => f.endsWith('.migration.ts')).sort();

export const generateScripts: GenerateScript[] = [];

for (const file of migrationFiles) {
  const mod = await import(`./migrations/${file.replace('.ts', '')}`);
  if (!mod.generateConfig) throw new Error(`Missing generateConfig export in migrations/${file}`);
  generateScripts.push(mod.generateConfig);
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
