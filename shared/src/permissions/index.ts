export type {
  PolicyMatrix,
  PolicyCallback,
  PolicyConfiguration,
  PolicyEntry,
  CanState,
  ChannelPolicyBuilder,
  EntityActionPermissions,
  PolicyCell,
  PolicyCellInput,
  EntityPolicies,
} from './types';
export type { PublicReadGrants } from './public-read';
export { isRowCondition, matchesRowCondition } from './row-conditions';
export type { ConditionActor, RowConditionName, RowForCondition } from './row-conditions';

// `configurePolicyMatrix` is test-only; it lives at `shared/testing/policies`, not on this barrel.
export { configurePermissions, getPolicyPermissions, getEntityPolicies } from './policy-matrix';
export type { PermissionsConfigResult } from './policy-matrix';
export { allActionsAllowed, allActionsDenied, createActionRecord, isUnconditionalCan, resolveCan } from './action-helpers';
export { computeCan } from './compute-can';
export type { EntityCanMap } from './compute-can';
export { policyMatrix, publicReadGrants, elevatedRoles } from '../../config/permissions-config';

// Permission engine (tier-neutral decision logic)
export { getAllDecisions } from './engine/check';
export { formatBatchPermissionSummary, formatPermissionDecision } from './engine/format';
export { validateMembership, validateSubject } from './engine/validation';
export type {
  ActionAttribution,
  AncestorChannelIds,
  ChannelIdColumns,
  GrantSource,
  PermissionCheckOptions,
  PermissionDecision,
  AccessMembership,
  ResolvedChannelIds,
  SubjectForPermission,
} from './engine/types';
export type { HierarchyOverrides } from './engine/resolve-hierarchy';
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
} from './check-access';
export { type EngineAccess, getDecisionsForAccesses, type ResolveAccessOptions } from './engine/resolve-access';
export { toColumnName, toTableName } from './schema-naming';
