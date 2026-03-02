/**
 * Shared package - Main barrel file
 *
 * Re-exports configuration, entity hierarchy, types, guards and utility functions.
 */

// App configuration
export { appConfig } from './app-config';
export type { ConfigMode } from './app-config';

// Entity hierarchy & roles
export { hierarchy, roles } from './default-config';

// Entity hierarchy types and builder functions
export type {
  ContextEntityView,
  EntityHierarchy,
  EntityKind,
  EntityView,
  ProductEntityView,
  RoleFromRegistry,
  UserEntityView,
  PublicAction,
  PublicActionsConfig,
  PublicActionsInherited,
  PublicActionsOption,
} from './src/builder/entity-hierarchy';
export {
  createEntityHierarchy,
  createRoleRegistry,
} from './src/builder/entity-hierarchy';

// Config builder types
export type { RequestLimitsConfig, RequiredConfig, S3Config } from './src/builder/types';

// App-derived types
export type {
  ContextEntityType,
  EnabledOAuthProvider,
  EntityActionType,
  EntityIdColumnKey,
  EntityIdColumnKeys,
  EntityIdColumnKeysShape,
  EntityRole,
  EntityType,
  Language,
  MenuSection,
  ParentlessProductEntityType,
  ProductEntityType,
  PublicProductEntityType,
  SeenTrackedEntityType,
  RelatableContextEntityType,
  ResourceType,
  Severity,
  SystemRole,
  Theme,
  TokenType,
  UploadTemplateId,
  UserFlags,
} from './types';

// Entity guard functions (bound to app hierarchy)
export {
  getContextRoles,
  isContextEntity,
  isProductEntity,
  isPublicProductEntity,
} from './entity-guards';

// Utility functions
export { hasKey, recordFromKeys, identityRecord, typedEntries, typedKeys } from './src/builder/utils';

// Permissions
export type {
  AccessPolicies,
  AccessPolicyCallback,
  AccessPolicyConfiguration,
  AccessPolicyEntry,
  ContextPolicyBuilder,
  EntityActionPermissions,
  PermissionValue,
  SubjectAccessPolicies,
} from './src/permissions';
export { configureAccessPolicies, getPolicyPermissions, getSubjectPolicies } from './src/permissions';
export { allActionsAllowed, allActionsDenied, createActionRecord } from './src/permissions';
export { accessPolicies, computeCan } from './src/permissions';
export type { EntityCanMap } from './src/permissions';

// Side-effect import: compile-time validation that config matches hierarchy
import './src/builder/config-validation';
