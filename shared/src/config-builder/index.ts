/**
 * Config builder utilities and types.
 * Contains entity hierarchy builder, type guards, and config type definitions.
 */

// Entity hierarchy builder
export type {
  ContextEntityView,
  EntityHierarchy,
  EntityKind,
  EntityView,
  ProductEntityView,
  RoleFromRegistry,
  UserEntityView,
} from './entity-hierarchy';
export {
  createEntityHierarchy,
  createRoleRegistry,
} from './entity-hierarchy';

// Utility functions
export { hasKey, identityRecord, mergeDeep, recordFromKeys } from './utils';

// Config types
export type {
  BaseAuthStrategies,
  BaseOAuthProviders,
  CompanyConfig,
  ConfigMode,
  DeepPartial,
  HasFlagsConfig,
  LocalBlobStorageConfig,
  MenuStructureItem,
  RequestLimitsConfig,
  RequiredConfig,
  S3Config,
  S3ConfigInput,
  ThemeConfig,
  ThemeNavigationConfig,
  TotpConfig,
  UppyRestrictionsConfig,
} from './types';
