// App configuration
export { appConfig } from './src/config-builder/app-config';
export type { ConfigMode } from './src/config-builder/types';

// Entity hierarchy & roles
export { hierarchy, roles } from './config/config.default';

// Entity hierarchy types and builder functions
export type {
  ChannelView,
  EntityHierarchy,
  EntityKind,
  EntityView,
  ProductView,
  RoleFromRegistry,
  UserEntityView,
} from './src/config-builder/entity-hierarchy';
export {
  createEntityHierarchy,
  createRoleRegistry,
} from './src/config-builder/entity-hierarchy';

// Row-to-home attribution (shared rule for CDC counters/self summaries, notifications, recalculation)
export type { AncestorSource, ResolvedAncestor } from './src/config-builder/resolve-row-channel';
export {
  entityIdColumnKey,
  entityIdColumnName,
  possibleHomeChannels,
  resolveDeepestAncestorId,
  resolveNonNullAncestors,
} from './src/config-builder/resolve-row-channel';

// Stored ID-path rule for sequence routing, move-out, and subtree addressing.
export {
  computeAncestorPath,
  computeChannelPath,
  computeProductPath,
  deepestAncestorSql,
  pathColumnSql,
  pathHomeId,
  pathSegments,
  pathStartsWith,
} from './src/config-builder/row-path';

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
  EntityIdColumns,
  EntityRole,
  EntityType,
  Language,
  MenuSection,
  NullableAncestorType,
  OrganizationFlags,
  ProductEntityType,
  RootChannelType,
  SeenTrackedProductType,
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

export { hasKey, identityRecord, nonEmpty, recordFromKeys, typedEntries, typedKeys } from './src/config-builder/utils';
export { seenWindowMs } from './src/seen-window';
export { draftVisibleTo, isUnpublishedDraft } from './src/published-rows';

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
export { isRowCondition, matchesRowCondition } from './src/permissions';
export type { ConditionActor, PublicReadGrants, PublicReadMode, RowConditionName, RowForCondition } from './src/permissions';
export { configurePermissions, getPolicyPermissions, getSubjectPolicies } from './src/permissions';
export type { PermissionsConfigResult } from './src/permissions';
export { allActionsAllowed, allActionsDenied, createActionRecord, isUnconditionalPermission, resolvePermission } from './src/permissions';
export { accessPolicies, computeCan, publicReadGrants, elevatedRoles } from './src/permissions';
export type { ActionPermissionState, EntityCanMap } from './src/permissions';

// Permission engine (tier-neutral decision logic, shared by backend + yjs)
export {
  type Access,
  type Actor,
  buildSubject,
  buildSubjectFromEntity,
  type BatchPermissionResult,
  checkAccess,
  checkAccessBatch,
  checkAccessFanout,
  type CheckAccessFanoutOptions,
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
  AncestorChannelIds,
  ChannelIdColumns,
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
