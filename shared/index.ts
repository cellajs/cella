/**
 * Shared package - Main barrel file
 *
 * Re-exports configuration, entity hierarchy, types, guards and utility functions.
 */

// App configuration
export { appConfig } from './src/config-builder/app-config';
export type { ConfigMode } from './src/config-builder/types';

// Entity hierarchy & roles
export { hierarchy, roles } from './config/config.default';

// Entity hierarchy types and builder functions
export type {
  ContextEntityView,
  EntityHierarchy,
  EntityKind,
  EntityView,
  ProductEntityView,
  RoleFromRegistry,
  UserEntityView,
  PublicReadMode,
  ContextPublicReadMode,
} from './src/config-builder/entity-hierarchy';
export {
  createEntityHierarchy,
  createRoleRegistry,
} from './src/config-builder/entity-hierarchy';

// Config builder types
export type { AppServiceEndpointConfig, RequestLimitsConfig, RequiredConfig, S3Config, S3ConfigInput } from './src/config-builder/types';

// App-derived types
export type {
  ActivityAction,
  ActivityEventType,
  ActivityVerb,
  AncestorContextType,
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
  RelatedContextType,
  ResourceType,
  Severity,
  SystemRole,
  Theme,
  TokenType,
  UploadTemplateId,
  UserFlags,
  PropagationHint,
} from './types';

// Activity actions and event types (value exports)
export { activityActions, activityEventTypes, activityVerbs, actionToVerb, isValidEventType } from './types';

export {
  getContextRoles,
  hasParentEntity,
  isContextEntity,
  isProductEntity,
  isPublicStreamEntity,
} from './src/entity-guards';

export { hasKey, recordFromKeys, identityRecord, typedEntries, typedKeys } from './src/config-builder/utils';

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
export { allActionsAllowed, allActionsDenied, createActionRecord, isUnconditionalPermission, resolvePermission } from './src/permissions';
export { accessPolicies, computeCan } from './src/permissions';
export type { ActionPermissionState, EntityCanMap } from './src/permissions';

// Side-effect import: compile-time validation that config matches hierarchy
import './src/config-builder/config-validation';
