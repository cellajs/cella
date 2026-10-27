export { accessScopes, policyMatrix, publicReadGrants } from '../../config/permissions-config.ts';
export type { AccessScope, AccessScopedEntityType } from './access-scopes.ts';
export { allActionsAllowed, type CanHome, isUnconditionalCan, resolveCan } from './action-helpers.ts';
export { buildSubject, buildSubjectFromEntity } from './build-subject.ts';
export {
  type Access,
  type BatchPermissionResult,
  checkAccess,
  checkAccessBatch,
  checkAccessFanout,
  type PermissionResult,
  type PredicateActor,
} from './check-access.ts';
export type { EntityCanMap } from './compute-can.ts';
export { computeCan } from './compute-can.ts';
export { getAllDecisions } from './engine/check.ts';
export type { HierarchyOverrides } from './engine/resolve-hierarchy.ts';
export type { AccessMembership, AncestorChannelIds, ChannelIdColumns, SubjectForPermission } from './engine/types.ts';
export { MissingAncestorError } from './missing-ancestor-error.ts';
export type { PermissionsConfigResult } from './policy-matrix.ts';
// `configurePolicyMatrix` is test-only; it lives at `shared/testing/policies`, not on this barrel.
export { configurePermissions, getEntityPolicies, getPolicyPermissions } from './policy-matrix.ts';
export type { PublicReadGrants } from './public-read.ts';
export type { RowConditionName } from './row-conditions.ts';
export { isRowCondition } from './row-conditions.ts';
export type { CanState, PolicyCallback, PolicyCell, PolicyCellInput, PolicyMatrix } from './types.ts';
export { validateAncestorScope } from './validate-ancestor-scope.ts';
