export { elevatedRoles, policyMatrix, publicReadGrants } from '../../config/permissions-config';
export {
  allActionsAllowed,
  allActionsDenied,
  createActionRecord,
  isUnconditionalCan,
  resolveCan,
} from './action-helpers';
export { buildSubject, buildSubjectFromEntity } from './build-subject';
export {
  type Access,
  type Actor,
  type BatchPermissionResult,
  type CheckAccessFanoutOptions,
  checkAccess,
  checkAccessBatch,
  checkAccessFanout,
  type PermissionResult,
} from './check-access';
export type { EntityCanMap } from './compute-can';
export { computeCan } from './compute-can';
// Permission engine (tier-neutral decision logic)
export { getAllDecisions } from './engine/check';
export { formatBatchPermissionSummary, formatPermissionDecision } from './engine/format';
export { type EngineAccess, getDecisionsForAccesses, type ResolveAccessOptions } from './engine/resolve-access';
export type { HierarchyOverrides } from './engine/resolve-hierarchy';
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
} from './engine/types';
export { validateMembership, validateSubject } from './engine/validation';
export { MissingScopeError } from './missing-scope-error';
export type { PermissionsConfigResult } from './policy-matrix';
// `configurePolicyMatrix` is test-only; it lives at `shared/testing/policies`, not on this barrel.
export { configurePermissions, getEntityPolicies, getPolicyPermissions } from './policy-matrix';
export type { PublicReadGrants } from './public-read';
export type { ConditionActor, RowConditionName, RowForCondition } from './row-conditions';
export { isRowCondition, matchesRowCondition } from './row-conditions';
export { toColumnName, toTableName } from './schema-naming';
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
} from './types';
export { validateAncestorScope } from './validate-ancestor-scope';
