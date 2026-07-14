export type {
  AccessPolicies,
  AccessPolicyCallback,
  AccessPolicyConfiguration,
  AccessPolicyEntry,
  ActionPermissionState,
  ContextPolicyBuilder,
  EntityActionPermissions,
  NormalizedPermissionValue,
  PermissionValue,
  SubjectAccessPolicies,
} from './types';
export { publicRow } from './public-read';
export type { PublicReadGrants, PublicReadMode } from './public-read';
export { isRowCondition, own } from './row-conditions';
export type { ConditionActor, RowCondition, RowConditionSqlForm, RowForCondition } from './row-conditions';

export { configureAccessPolicies, configurePermissions, getPolicyPermissions, getSubjectPolicies } from './access-policies';
export type { PermissionsConfigResult } from './access-policies';
export { allActionsAllowed, allActionsDenied, createActionRecord, resolvePermission } from './action-helpers';
export { computeCan } from './compute-can';
export type { EntityCanMap } from './compute-can';
export { accessPolicies, publicReadGrants, elevatedRoles } from '../../config/permissions-config';

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
export type { PermissionTopology, TopologyHierarchy } from './permission-manager/topology';
export { buildSubject, buildSubjectFromEntity } from './build-subject';
export { validateAncestorScope } from './validate-ancestor-scope';
export { MissingScopeError } from './missing-scope-error';
export { type Actor, type BatchPermissionResult, checkPermission, type PermissionResult } from './check-permission';
export { toColumnName, toTableName } from './schema-naming';
