/**
 * External types for config consumers.
 * Re-exports the essential types from src/builder/types.ts
 */
export type {
  DeepPartial,
  ConfigMode,
  RequiredConfig,
  S3Config,
  RequestLimitsConfig,
} from './src/builder/types';

/**
 * Full config type derived from default-config.ts.
 * Forks should use `satisfies RequiredConfig` for type enforcement.
 */
export type { config as Config } from './default-config';
