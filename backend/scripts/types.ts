/**
 * - 'drizzle': schema-to-SQL generation (drizzle-kit generate)
 * - 'migration': custom migration script that upserts to the drizzle folder
 */
export type GenerateScriptType = 'drizzle' | 'migration';

/**
 * Configuration for a generation script run during `pnpm generate`.
 * Export as `generateConfig` from any `*.migration.ts` file in scripts/migrations/ to auto-register.
 * Files are sorted alphabetically by filename; use numeric prefixes to control order.
 */
export interface GenerateScript {
  /** Human-readable script name. */
  name: string;
  /** Script type, which determines execution behavior. */
  type: GenerateScriptType;
  /** Generate function to execute. */
  run: () => Promise<void>;
}

/**
 * Configuration for a seed script run during `pnpm seed`.
 * Export as `seedConfig` from any `*.seed.ts` file in scripts/seeds/ to auto-register.
 * Files are sorted alphabetically by filename; use numeric prefixes to control order.
 */
export interface SeedScript {
  /** Unique name used as CLI target (eg `pnpm seed init`). */
  name: string;
  /** Seed function to execute. */
  run: () => Promise<void>;
  /** Allows this seed to run in production. Defaults to false. */
  allowProduction?: boolean;
}
