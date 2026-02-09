import type { GenerateScript } from './types';

// TODO-010: review cli/create-cella to check if the cleaning of drizzle folder and running the migration still works as expected with the new structure. We might need to perhaps adjust the paths or commands accordingly.

/** Scripts run during `pnpm generate` for migrations */
export const generateScripts: GenerateScript[] = [
  {
    name: 'Drizzle migrations',
    // Use tsx to run drizzle-kit so path aliases (#/) are resolved
    command: 'tsx node_modules/drizzle-kit/bin.cjs generate --config drizzle.config.ts',
    type: 'drizzle',
  },
  {
    name: 'CDC setup migration',
    command: 'tsx scripts/migrations/cdc-migration.ts',
    type: 'migration',
    migrationTag: 'cdc_setup',
  },
  {
    name: 'Partman setup migration',
    command: 'tsx scripts/migrations/partman-migration.ts',
    type: 'migration',
    migrationTag: 'partman_setup',
  },
  {
    name: 'RLS setup migration',
    command: 'tsx scripts/migrations/rls-migration.ts',
    type: 'migration',
    migrationTag: 'rls_setup',
  },
  {
    name: 'Immutability triggers migration',
    command: 'tsx scripts/migrations/immutability-migration.ts',
    type: 'migration',
    migrationTag: 'immutability_setup',
  },
];

/** Seed scripts run during `pnpm seed` */
export const seedScripts = ['pnpm run seed:user', 'pnpm run seed:organizations', 'pnpm run seed:data'];
