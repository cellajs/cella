import { hierarchy } from './config/config.default.ts';

export { hierarchy, roles } from './config/config.default.ts';
export { appConfig, urlEnvNames, withConfiguredDevPorts } from './src/config-builder/app-config.ts';
export { type ConfigSwitch, isStrategyEnabled, isSwitchOn } from './src/config-builder/config-switch.ts';
export type { ConfigMode } from './src/config-builder/types.ts';

// The app singleton's own arrow fields, so binding survives destructuring. Test mocks replacing
// `hierarchy` must override these from the same synthetic instance.
export const { isChannel, isProduct } = hierarchy;

export type { EntityHierarchy, ResolvedAncestor } from './src/config-builder/entity-hierarchy.ts';
export {
  createEntityHierarchy,
  createRoleRegistry,
} from './src/config-builder/entity-hierarchy.ts';
// Home attribution and paths are instance methods on EntityHierarchy; only the naming rule and
// the pure path-string helpers are free exports.
export { entityIdColumnKey, entityIdColumnName } from './src/config-builder/entity-id-column.ts';
export { pathHomeId, pathSegments, pathStartsWith } from './src/config-builder/row-path.ts';
export type { FederationConfig, NavigationConfig, RequiredConfig, S3Config, S3ConfigInput } from './src/config-builder/types.ts';
export { nonEmpty, recordFromKeys, typedEntries } from './src/config-builder/utils.ts';
export type {
  AccessMembership,
  AncestorChannelIds,
  CanHome,
  CanState,
  ChannelIdColumns,
  EntityCanMap,
  HierarchyOverrides,
  PolicyCell,
  PolicyCellInput,
  PolicyMatrix,
  PublicReadGrants,
  RowConditionName,
  SubjectForPermission,
} from './src/permissions/index.ts';
export {
  type Access,
  type AccessScope,
  type AccessScopedEntityType,
  accessScopes,
  allActionsAllowed,
  type BatchPermissionResult,
  buildSubject,
  buildSubjectFromEntity,
  checkAccess,
  checkAccessBatch,
  checkAccessFanout,
  computeCan,
  getAllDecisions,
  getEntityPolicies,
  getPolicyPermissions,
  isRowCondition,
  isUnconditionalCan,
  MissingAncestorError,
  type PermissionResult,
  type PredicateActor,
  policyMatrix,
  publicReadGrants,
  resolveCan,
  validateAncestorScope,
} from './src/permissions/index.ts';
export { draftVisibleTo, isUnpublishedDraft } from './src/published-rows.ts';
export { seenWindowMs } from './src/seen-window.ts';
export { toColumnName, toTableName } from './src/utils/schema-naming.ts';
export type {
  ActivityAction,
  ActivityVerb,
  AncestorChannelType,
  ChannelEntityType,
  EnabledOAuthProvider,
  EntityActionType,
  EntityIdColumnKey,
  EntityIdColumns,
  EntityRole,
  EntityType,
  FederationKey,
  Language,
  MenuSection,
  NullableAncestorType,
  OrganizationFlags,
  OrganizationRole,
  OrganizationSetupConfig,
  ProductEntityType,
  PropagationHint,
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
export { actionToVerb, activityActions, isValidEventType, trackedEventTypes } from './types.ts';

// Side-effect import: the config checks that need the policy matrix run in every program that imports `shared`.
import './src/config-builder/config-validation.ts';
