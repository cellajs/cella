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

// Entity type guards
export {
  getContextRoles,
  isContextEntity,
  isProductEntity,
  isPublicProductEntity,
} from './entity-guards';

// Config types
export type {
  BaseAuthStrategies,
  BaseOAuthProviders,
  CompanyConfig,
  ConfigMode,
  DeepPartial,
  FeatureFlagsConfig,
  LocalBlobStorageConfig,
  MenuStructureItem,
  RequestLimitsConfig,
  RequiredConfig,
  S3Config,
  ThemeConfig,
  ThemeNavigationConfig,
  TotpConfig,
  UppyRestrictionsConfig,
} from './types';
