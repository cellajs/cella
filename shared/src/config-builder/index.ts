// Entity hierarchy builder
export type {
  ChannelEntityView,
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

// Row-to-context attribution (shared rule for CDC seq/counters, notifications, recalculation)
export type { AncestorSource, ResolvedAncestor } from './resolve-row-channel';
export { possibleHomeChannels, resolveDeepestAncestorId, resolveNonNullAncestors } from './resolve-row-channel';

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
