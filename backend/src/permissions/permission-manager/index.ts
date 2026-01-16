// Access policy functions
export { configureAccessPolicies, getPolicyPermissions, getSubjectPolicies } from './access-policies';

// Permission check functions
export { type AllPermissionsResult, checkAllPermissions, type PermissionDecision } from './check';

// Hierarchy functions
export {
  createContext,
  createHierarchy,
  createProduct,
  getAncestorContexts,
  getContextRoles,
  isContextEntity,
  isProductEntity,
} from './hierarchy';

// Types
export type {
  AccessPolicies,
  AccessPolicyCallback,
  AccessPolicyConfiguration,
  AccessPolicyEntry,
  ActionAttribution,
  ContextConfig,
  ContextEntityIdColumns,
  ContextPolicyBuilder,
  EntityActionPermissions,
  EntityConfig,
  HierarchyConfig,
  MembershipForPermission,
  PermissionValue,
  ProductConfig,
  SubjectAccessPolicies,
  SubjectForPermission,
} from './types';
