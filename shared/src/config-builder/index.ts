// Entity hierarchy builder
export type {
  ChannelView,
  EntityHierarchy,
  EntityKind,
  EntityView,
  ProductView,
  RoleFromRegistry,
  UserEntityView,
} from './entity-hierarchy';
export {
  createEntityHierarchy,
  createRoleRegistry,
} from './entity-hierarchy';

// Row location: home attribution and paths are instance methods on EntityHierarchy.
export type { ResolvedAncestor } from './resolve-row-channel';
export { entityIdColumnKey, entityIdColumnName } from './resolve-row-channel';
export { pathHomeId, pathSegments, pathStartsWith } from './row-path';

// Utility functions
export { hasKey, identityRecord, mergeDeep, nonEmpty, recordFromKeys } from './utils';

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
