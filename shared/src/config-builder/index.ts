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

// Row-to-home attribution (shared rule for CDC counters/self summaries, notifications, recalculation)
export type { AncestorSource, ResolvedAncestor } from './resolve-row-channel';
export { possibleHomeChannels, resolveDeepestAncestorId, resolveNonNullAncestors } from './resolve-row-channel';

// Materialized id-path rule (sequence sync: routing, move-out, subtree addressing)
export {
  computeAncestorPath,
  computeChannelPath,
  computeProductPath,
  pathHomeId,
  pathSegments,
  pathStartsWith,
} from './row-path';

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
