// Access policy functions
export { configureAccessPolicies, getPolicyPermissions, getSubjectPolicies } from './access-policies';

// Permission check functions
export { type AllPermissionsResult, checkAllPermissions } from './check';

// Hierarchy functions (now backed by appConfig.entityConfig)
export { getAncestorContexts, getContextRoles, isContextEntity, isProductEntity } from './hierarchy';

// Types
export type {
  AccessPolicies,
  AccessPolicyCallback,
  AccessPolicyConfiguration,
  AccessPolicyEntry,
  ActionAttribution,
  ContextEntityIdColumns,
  ContextPolicyBuilder,
  EntityActionPermissions,
  MembershipForPermission,
  PermissionValue,
  SubjectAccessPolicies,
  SubjectForPermission,
} from './types';
