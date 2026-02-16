/**
 * Type of generation script.
 * - 'drizzle': Schema-to-SQL generation (drizzle-kit generate)
 * - 'migration': Custom migration script that upserts to drizzle folder
 */
export type GenerateScriptType = 'drizzle' | 'migration';

/**
 * Configuration for a generation script run during `pnpm generate`.
 */
export interface GenerateScript {
  /** Human-readable name for the script */
  name: string;
  /** Shell command to run */
  command: string;
  /** Script type - determines behavior and validation */
  type: GenerateScriptType;
  /** For 'migration' type: the migration tag suffix (e.g., 'cdc_setup') */
  migrationTag?: string;
}
