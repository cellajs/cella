import type config from "./default";

export type DeepPartial<T> = T extends object
  ? {
    [P in keyof T]?: DeepPartial<T[P]>;
  }
  : T;

/** Environment mode - set per environment config file */
export type ConfigMode = 'development' | 'production' | 'tunnel' | 'test' | 'staging';

export type BaseConfigType = {
  mode: ConfigMode;
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
 * REQUIRED CONFIG TYPES
 * These types enforce critical config keys that forks must provide.
 * TypeScript will error if these are missing or malformed.
 ******************************************************************************/

/** S3-compatible storage configuration */
export interface S3Config {
  /** Prefix to namespace files when sharing a bucket */
  bucketPrefix?: string;
  /** Public bucket name for publicly accessible files */
  publicBucket: string;
  /** Private bucket name for authenticated-only files */
  privateBucket: string;
  /** S3 region identifier */
  region: string;
  /** S3 host endpoint */
  host: string;
  /** CDN URL for private bucket */
  privateCDNUrl?: string;
  /** CDN URL for public bucket */
  publicCDNUrl?: string;
}

/**
 * System roles config - tuple requiring 'admin' as first element.
 * Additional roles can be added after 'admin'.
 */
export type SystemRolesConfig = readonly ['admin', ...string[]];

/**
 * Request limits config - must include 'default' key.
 * Other keys are entity-specific limits.
 */
export interface RequestLimitsConfig {
  default: number;
  [key: string]: number;
}

/**
 * Entity config map - must include 'user' and 'organization'.
 * Additional entities can be added.
 */
export interface EntityConfigMap {
  user: UserEntityConfig;
  organization: ContextEntityConfig;
  [key: string]: EntityConfigEntry;
}

/**
 * Required config keys that forks must provide.
 * These are critical for the entity model, storage, and API limits.
 */
export interface RequiredConfig {
  /** Environment mode */
  mode: ConfigMode;
  /** S3 storage configuration */
  s3: S3Config;
  /** System-wide roles (must include 'admin') */
  systemRoles: SystemRolesConfig;
  /** Entity hierarchy configuration */
  entityConfig: EntityConfigMap;
  /** Request page size limits */
  requestLimits: RequestLimitsConfig;
  /** All entity types - must match entityConfig keys */
  entityTypes: readonly string[];
  /** Context entities with memberships */
  contextEntityTypes: readonly string[];
  /** Product/content entities */
  productEntityTypes: readonly string[];
  /** Upload template IDs for Transloadit */
  uploadTemplateIds: readonly string[];
  /** Maps entity types to their ID column names */
  entityIdColumnKeys: Record<string, string>;
}

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

/******************************************************************************
 * CONFIG TYPE
 ******************************************************************************/

type ConfigType = DeepPartial<typeof config>

/**
 * Full config type - combines optional fields with required config.
 * Forks get TypeScript errors when required config is missing or malformed.
 */
export type Config = Omit<ConfigType, keyof RequiredConfig> & RequiredConfig;