import type config from "./default";

export type DeepPartial<T> = T extends object
  ? {
    [P in keyof T]?: DeepPartial<T[P]>;
  }
  : T;

export type BaseConfigType = {
  mode: 'development' | 'production' | 'tunnel' | 'test' | 'staging',
  s3BucketPrefix?: string
}

export type BaseAuthStrategies = 'password' | 'passkey' | 'oauth' | 'totp'
export type BaseOAuthProviders = 'github' | 'google' | 'microsoft'

/******************************************************************************
 * ENTITY CONFIG TYPES
 ******************************************************************************/

/** Entity kinds in the system */
export type EntityKind = 'user' | 'context' | 'product';

/** Configuration for user entity (unique, doesn't fit context/product model) */
export interface UserEntityConfig {
  kind: 'user';
}

/** Configuration for context entities (have memberships) */
export interface ContextEntityConfig {
  kind: 'context';
  ancestors: readonly string[];
  roles: readonly string[];
}

/** Configuration for product entities (content, no memberships) */
export interface ProductEntityConfig {
  kind: 'product';
  ancestors: readonly string[];
}

/** Union of all entity config entry types */
export type EntityConfigEntry = UserEntityConfig | ContextEntityConfig | ProductEntityConfig;

/******************************************************************************
 * GENERATION SCRIPTS
 ******************************************************************************/

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

type ConfigType = DeepPartial<typeof config>

export type Config = Omit<ConfigType, keyof BaseConfigType> & BaseConfigType;