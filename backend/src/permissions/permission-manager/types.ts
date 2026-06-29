// Re-export shim: the permission types now live in the shared engine.
// Backend keeps this path so `#/permissions/permission-manager/types` callers are unchanged.
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
} from 'shared';
