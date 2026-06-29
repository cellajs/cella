/**
 * Type of generation script.
 * - 'drizzle': Schema-to-SQL generation (drizzle-kit generate)
 * - 'migration': Custom migration script that upserts to drizzle folder
 */
export type GenerateScriptType = 'drizzle' | 'migration';

/**
 * Configuration for a generation script run during `pnpm generate`.
 * Export as `generateConfig` from any `*.migration.ts` file in scripts/migrations/ to auto-register.
 * Files are sorted alphabetically by filename — use numeric prefixes to control order.
 */
export interface GenerateScript {
  /** Human-readable name for the script */
  name: string;
  /** Script type - determines execution behavior (drizzle runs first, delays between migrations) */
  type: GenerateScriptType;
  /** The generate function to execute */
  run: () => Promise<void>;
}

/**
 * Configuration for a seed script run during `pnpm seed`.
 * Export as `seedConfig` from any `*.seed.ts` file in scripts/seeds/ to auto-register.
 * Files are sorted alphabetically by filename — use numeric prefixes to control order.
 */
export interface SeedScript {
  /** Unique name used as CLI target (eg `pnpm seed init`) */
  name: string;
  /** The seed function to execute */
  run: () => Promise<void>;
  /** Allow this seed to run in production (default: false) */
  allowProduction?: boolean;
}
