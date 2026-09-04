import { hierarchy } from './config/config.default.ts';

export { hierarchy, roles } from './config/config.default.ts';
export { appConfig } from './src/config-builder/app-config.ts';
export type { ConfigMode } from './src/config-builder/types.ts';

// The app singleton's own arrow fields, so binding survives destructuring. Test mocks replacing
// `hierarchy` must override these from the same synthetic instance.
export const { isChannel, isProduct } = hierarchy;

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
// Home attribution and paths are instance methods on EntityHierarchy; only the naming rule and
// the pure path-string helpers are free exports.
export type { ResolvedAncestor } from './src/config-builder/resolve-row-channel.ts';
export { entityIdColumnKey, entityIdColumnName } from './src/config-builder/resolve-row-channel.ts';
export { pathHomeId, pathSegments, pathStartsWith } from './src/config-builder/row-path.ts';
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
  SeenTrackedProductType,
  Severity,
  SystemRole,
  Theme,
  TokenType,
  TrackedEventType,
  UploadTemplateId,
  UserFlags,
} from './types.ts';
export { actionToVerb, activityActions, activityVerbs, isValidEventType, trackedEventTypes } from './types.ts';

// Side-effect import: compile-time check that the config matches the hierarchy.
import './src/config-builder/config-validation.ts';
