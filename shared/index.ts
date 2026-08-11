import { hierarchy } from './config/config.default.ts';

// Entity hierarchy & roles
export { hierarchy, roles } from './config/config.default.ts';
// App configuration
export { appConfig } from './src/config-builder/app-config.ts';
export type { ConfigMode } from './src/config-builder/types.ts';

// Bound guard facade: these ARE the app singleton's methods (arrow fields, so binding is
// preserved), re-exported for the two highest-frequency checks. Everything else stays on
// the instance. Test mocks that replace `hierarchy` must override these from the same
// synthetic instance.
export const { isChannel, isProduct } = hierarchy;

// Entity hierarchy types and builder functions
export type {
  ChannelView,
  EntityHierarchy,
  EntityKind,
  EntityView,
  ProductView,
  RoleFromRegistry,
  UserEntityView,
} from './src/config-builder/entity-hierarchy.ts';
export {
  createEntityHierarchy,
  createRoleRegistry,
} from './src/config-builder/entity-hierarchy.ts';
// Row location: home attribution and paths are instance methods on EntityHierarchy.
// Only the naming rule and the pure path-string helpers remain as free exports.
export type { ResolvedAncestor } from './src/config-builder/resolve-row-channel.ts';
export { entityIdColumnKey, entityIdColumnName } from './src/config-builder/resolve-row-channel.ts';
export { pathHomeId, pathSegments, pathStartsWith } from './src/config-builder/row-path.ts';
// Config builder types
export type {
  AppServiceEndpointConfig,
  RequestLimitsConfig,
  RequiredConfig,
  S3Config,
  S3ConfigInput,
} from './src/config-builder/types.ts';
export {
  hasKey,
  identityRecord,
  nonEmpty,
  recordFromKeys,
  typedEntries,
  typedKeys,
} from './src/config-builder/utils.ts';
// Permissions
export type {
  AccessMembership,
  ActionAttribution,
  AncestorChannelIds,
  CanState,
  ChannelIdColumns,
  ChannelPolicyBuilder,
  ConditionActor,
  EntityActionPermissions,
  EntityCanMap,
  EntityPolicies,
  GrantSource,
  HierarchyOverrides,
  PermissionCheckOptions,
  PermissionDecision,
  PermissionsConfigResult,
  PolicyCallback,
  PolicyCell,
  PolicyCellInput,
  PolicyConfiguration,
  PolicyEntry,
  PolicyMatrix,
  PublicReadGrants,
  ResolvedChannelIds,
  RowConditionName,
  RowForCondition,
  SubjectForPermission,
} from './src/permissions/index.ts';
// Permission engine (tier-neutral decision logic, shared by backend + yjs)
export {
  type Access,
  type Actor,
  allActionsAllowed,
  allActionsDenied,
  type BatchPermissionResult,
  buildSubject,
  buildSubjectFromEntity,
  type CheckAccessFanoutOptions,
  checkAccess,
  checkAccessBatch,
  checkAccessFanout,
  computeCan,
  configurePermissions,
  createActionRecord,
  elevatedRoles,
  formatBatchPermissionSummary,
  formatPermissionDecision,
  getAllDecisions,
  getEntityPolicies,
  getPolicyPermissions,
  isRowCondition,
  isUnconditionalCan,
  MissingScopeError,
  matchesRowCondition,
  type PermissionResult,
  policyMatrix,
  publicReadGrants,
  resolveCan,
  toColumnName,
  toTableName,
  validateAncestorScope,
  validateMembership,
  validateSubject,
} from './src/permissions/index.ts';
export { draftVisibleTo, isUnpublishedDraft } from './src/published-rows.ts';
export { seenWindowMs } from './src/seen-window.ts';
// App-derived types
export type {
  ActivityAction,
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
  OrganizationSetupConfig,
  ProductEntityType,
  PropagationHint,
  RelatableChannelEntityType,
  RelatedChannelType,
  ResourceType,
  RootChannelType,
  SeenTrackedProductType,
  Severity,
  SystemRole,
  Theme,
  TokenType,
  TrackedEventType,
  UploadTemplateId,
  UserFlags,
} from './types.ts';
// Activity actions and event types (value exports)
export { actionToVerb, activityActions, activityVerbs, isValidEventType, trackedEventTypes } from './types.ts';

// Side-effect import: compile-time validation that config matches hierarchy
import './src/config-builder/config-validation.ts';
