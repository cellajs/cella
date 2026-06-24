export type {
  AccessPolicies,
  AccessPolicyCallback,
  AccessPolicyConfiguration,
  AccessPolicyEntry,
  ActionPermissionState,
  ContextPolicyBuilder,
  EntityActionPermissions,
  PermissionValue,
  SubjectAccessPolicies,
} from './types';

export { configureAccessPolicies, getPolicyPermissions, getSubjectPolicies } from './access-policies';
export { allActionsAllowed, allActionsDenied, createActionRecord, isUnconditionalPermission, resolvePermission } from './action-helpers';
export { computeCan } from './compute-can';
export type { EntityCanMap } from './compute-can';
export { accessPolicies } from '../../config/permissions-config';

// Permission engine (tier-neutral decision logic)
export { getAllDecisions } from './permission-manager/check';
export { formatBatchPermissionSummary, formatPermissionDecision } from './permission-manager/format';
export { validateMembership, validateSubject } from './permission-manager/validation';
export type {
  ActionAttribution,
  ContextEntityIdColumns,
  ContextScope,
  GrantSource,
  PermissionCheckOptions,
  PermissionDecision,
  PermissionMembership,
  ResolvedContextIds,
  SubjectForPermission,
} from './permission-manager/types';
export { buildSubject, buildSubjectFromEntity } from './build-subject';
export { validateAncestorScope } from './validate-ancestor-scope';
export { MissingScopeError } from './missing-scope-error';
export { type BatchPermissionResult, checkPermission, type PermissionResult } from './check-permission';
