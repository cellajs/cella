export { policyMatrix, publicReadGrants } from '../../config/permissions-config.ts';
export {
  allActionsAllowed,
  allActionsDenied,
  createActionRecord,
  isUnconditionalCan,
  resolveCan,
} from './action-helpers.ts';
export { buildSubject, buildSubjectFromEntity } from './build-subject.ts';
export {
  type Access,
  type Actor,
  type BatchPermissionResult,
  type CheckAccessFanoutOptions,
  checkAccess,
  checkAccessBatch,
  checkAccessFanout,
  type PermissionResult,
} from './check-access.ts';
export type { EntityCanMap } from './compute-can.ts';
export { computeCan } from './compute-can.ts';
// Permission engine (tier-neutral decision logic)
export { getAllDecisions } from './engine/check.ts';
export { formatBatchPermissionSummary, formatPermissionDecision } from './engine/format.ts';
export { type EngineAccess, getDecisionsForAccesses, type ResolveAccessOptions } from './engine/resolve-access.ts';
export type { HierarchyOverrides } from './engine/resolve-hierarchy.ts';
export type {
  AccessMembership,
  ActionAttribution,
  AncestorChannelIds,
  ChannelIdColumns,
  GrantSource,
  PermissionCheckOptions,
  PermissionDecision,
  ResolvedChannelIds,
  SubjectForPermission,
} from './engine/types.ts';
export { validateMembership, validateSubject } from './engine/validation.ts';
export { MissingScopeError } from './missing-scope-error.ts';
export type { PermissionsConfigResult } from './policy-matrix.ts';
// `configurePolicyMatrix` is test-only; it lives at `shared/testing/policies`, not on this barrel.
export { configurePermissions, getEntityPolicies, getPolicyPermissions } from './policy-matrix.ts';
export type { PublicReadGrants } from './public-read.ts';
export type { ConditionActor, RowConditionName, RowForCondition } from './row-conditions.ts';
export { isRowCondition, matchesRowCondition } from './row-conditions.ts';
export { toColumnName, toTableName } from './schema-naming.ts';
export type {
  CanState,
  ChannelPolicyBuilder,
  EntityActionPermissions,
  EntityPolicies,
  PolicyCallback,
  PolicyCell,
  PolicyCellInput,
  PolicyConfiguration,
  PolicyEntry,
  PolicyMatrix,
} from './types.ts';
export { validateAncestorScope } from './validate-ancestor-scope.ts';
