export type {
  AccessPolicies,
  AccessPolicyCallback,
  AccessPolicyConfiguration,
  AccessPolicyEntry,
  ActionPermissionState,
  ChannelPolicyBuilder,
  EntityActionPermissions,
  NormalizedPermissionValue,
  PermissionValue,
  SubjectAccessPolicies,
} from './types';
export type { PublicReadGrants, PublicReadMode } from './public-read';
export { isRowCondition, matchesRowCondition } from './row-conditions';
export type { ConditionActor, RowConditionName, RowForCondition } from './row-conditions';

// `configureAccessPolicies` is test-only; it lives at `shared/testing/policies`, not on this barrel.
export { configurePermissions, getPolicyPermissions, getSubjectPolicies } from './access-policies';
export type { PermissionsConfigResult } from './access-policies';
export { allActionsAllowed, allActionsDenied, createActionRecord, isUnconditionalPermission, resolvePermission } from './action-helpers';
export { computeCan } from './compute-can';
export type { EntityCanMap } from './compute-can';
export { accessPolicies, publicReadGrants, elevatedRoles } from '../../config/permissions-config';

// Permission engine (tier-neutral decision logic)
export { getAllDecisions } from './permission-manager/check';
export { formatBatchPermissionSummary, formatPermissionDecision } from './permission-manager/format';
export { validateMembership, validateSubject } from './permission-manager/validation';
export type {
  ActionAttribution,
  ChannelEntityIdColumns,
  ChannelScope,
  GrantSource,
  PermissionCheckOptions,
  PermissionDecision,
  PermissionMembership,
  ResolvedChannelIds,
  SubjectForPermission,
} from './permission-manager/types';
export type { PermissionTopology, TopologyHierarchy } from './permission-manager/topology';
export { buildSubject, buildSubjectFromEntity } from './build-subject';
export { validateAncestorScope } from './validate-ancestor-scope';
export { MissingScopeError } from './missing-scope-error';
export {
  type Access,
  type Actor,
  type BatchPermissionResult,
  checkAccess,
  checkAccessBatch,
  checkAccessFanout,
  type CheckAccessFanoutOptions,
  type PermissionResult,
} from './check-permission';
export { type EngineAccess, getDecisionsForAccesses, type ResolveAccessOptions } from './permission-manager/resolve-access';
export { toColumnName, toTableName } from './schema-naming';
