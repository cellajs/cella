// App configuration
export { appConfig } from './src/config-builder/app-config';
export type { ConfigMode } from './src/config-builder/types';

// Entity hierarchy & roles
export { hierarchy, roles } from './config/config.default';

// Entity hierarchy types and builder functions
export type {
  ChannelEntityView,
  EntityHierarchy,
  EntityKind,
  EntityView,
  ProductEntityView,
  RoleFromRegistry,
  UserEntityView,
} from './src/config-builder/entity-hierarchy';
export {
  createEntityHierarchy,
  createRoleRegistry,
} from './src/config-builder/entity-hierarchy';

// Row-to-context attribution (shared rule for CDC seq/counters, notifications, recalculation)
export type { AncestorSource, ResolvedAncestor } from './src/config-builder/resolve-row-channel';
export {
  possibleHomeChannels,
  resolveDeepestAncestorId,
  resolveNonNullAncestors,
} from './src/config-builder/resolve-row-channel';

// Config builder types
export type { AppServiceEndpointConfig, RequestLimitsConfig, RequiredConfig, S3Config, S3ConfigInput } from './src/config-builder/types';

// App-derived types
export type {
  ActivityAction,
  ActivityEventType,
  ActivityVerb,
  AncestorChannelType,
  ChannelEntityType,
  EnabledOAuthProvider,
  EntityActionType,
  EntityIdColumnKey,
  EntityIdColumnKeys,
  EntityIdColumnKeysShape,
  EntityIdColumns,
  EntityRole,
  EntityType,
  Language,
  MenuSection,
  NullableAncestorType,
  ProductEntityType,
  RootChannelType,
  SeenTrackedEntityType,
  RelatableChannelEntityType,
  RelatedChannelType,
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
  getChannelRoles,
  isChannelEntity,
  isProductEntity,
} from './src/entity-guards';

export { hasKey, recordFromKeys, identityRecord, typedEntries, typedKeys } from './src/config-builder/utils';

// Permissions
export type {
  AccessPolicies,
  AccessPolicyCallback,
  AccessPolicyConfiguration,
  AccessPolicyEntry,
  ChannelPolicyBuilder,
  EntityActionPermissions,
  NormalizedPermissionValue,
  PermissionValue,
  SubjectAccessPolicies,
} from './src/permissions';
export { isRowCondition, own, publicRow, rowPredicateMatches } from './src/permissions';
export type { ConditionActor, PublicReadGrants, PublicReadMode, RowCondition, RowForCondition, RowPredicate } from './src/permissions';
export { configureAccessPolicies, configurePermissions, getPolicyPermissions, getSubjectPolicies } from './src/permissions';
export type { PermissionsConfigResult } from './src/permissions';
export { allActionsAllowed, allActionsDenied, createActionRecord, resolvePermission } from './src/permissions';
export { accessPolicies, computeCan, publicReadGrants, elevatedRoles } from './src/permissions';
export type { ActionPermissionState, EntityCanMap } from './src/permissions';

// Permission engine (tier-neutral decision logic, shared by backend + yjs)
export {
  type Actor,
  buildSubject,
  buildSubjectFromEntity,
  type BatchPermissionResult,
  checkPermission,
  formatBatchPermissionSummary,
  formatPermissionDecision,
  getAllDecisions,
  MissingScopeError,
  type PermissionResult,
  toColumnName,
  toTableName,
  validateAncestorScope,
  validateMembership,
  validateSubject,
} from './src/permissions';
export type {
  ActionAttribution,
  ChannelEntityIdColumns,
  ChannelScope,
  GrantSource,
  PermissionCheckOptions,
  PermissionDecision,
  PermissionMembership,
  PermissionTopology,
  ResolvedChannelIds,
  SubjectForPermission,
} from './src/permissions';

// Side-effect import: compile-time validation that config matches hierarchy
import './src/config-builder/config-validation';
