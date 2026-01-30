import type {
  ContextEntityType,
  EntityActionType,
  EntityIdColumnKeys,
  EntityRole,
  EntityType,
  ProductEntityType,
  SystemRole,
} from 'config';

/**
 * Permission value: 1 = allowed, 0 = denied.
 */
export type PermissionValue = 0 | 1;

/**
 * Entity action permission set mapping each action to a permission value.
 */
export type EntityActionPermissions = Record<EntityActionType, PermissionValue>;

/**
 * Access policy entry for a specific context and role combination.
 */
export interface AccessPolicyEntry {
  contextType: ContextEntityType;
  role: EntityRole;
  permissions: EntityActionPermissions;
}

/**
 * Access policies for a subject (entity type).
 */
export type SubjectAccessPolicies = AccessPolicyEntry[];

/**
 * Full access policy configuration mapping subjects to their policies.
 * Only context and product entities have access policies - user access uses separate logic.
 */
export type AccessPolicies = Partial<Record<ContextEntityType | ProductEntityType, SubjectAccessPolicies>>;

/**
 * Context entity ID keys derived from entityIdColumnKeys config.
 * Maps each context entity type to its ID column value type.
 */
export type ContextEntityIdColumns = {
  [K in ContextEntityType as EntityIdColumnKeys[K]]?: string;
};

/**
 * Membership data required for permission checks.
 * Aligned with MembershipBaseModel to avoid adapters.
 */
export type MembershipForPermission = {
  /** The context entity type (e.g., 'organization') */
  contextType: ContextEntityType;
  /** The user's role in this context (string to match DB type) */
  role: string;
} & ContextEntityIdColumns;

/**
 * Subject (entity) data required for permission checks.
 * Represents the entity being accessed and its context relationships.
 * Note: Only context and product entities are supported - user access uses separate logic.
 */
export type SubjectForPermission = {
  /** The entity type being accessed (context or product, not user) */
  entityType: ContextEntityType | ProductEntityType;
  id: string;
} & ContextEntityIdColumns;

/**
 * Attribution for a single action showing whether it's enabled and which grants enabled it.
 * Used in PermissionDecision to provide detailed debugging and audit trails.
 */
export interface ActionAttribution {
  /** Whether this action is allowed (true if any grant enables it) */
  enabled: boolean;
  /** List of grants that enabled this action (empty if denied) */
  grantedBy: Array<{
    contextType: ContextEntityType;
    contextId: string;
    role: string;
  }>;
}

/**
 * Full permission decision with action attribution for debugging and auditing.
 * Provides complete traceability: for each action, shows exactly which memberships granted it.
 */
export interface PermissionDecision<T extends MembershipForPermission> {
  /** The subject being checked with resolved context IDs */
  subject: {
    entityType: ContextEntityType | ProductEntityType;
    id: string;
    contextIds: Partial<Record<ContextEntityType, string>>;
  };
  /** Context types checked in order (most specific to root). First element is primaryContext. */
  orderedContexts: ContextEntityType[];
  /** The primary context where membership is captured (always orderedContexts[0]) */
  primaryContext: ContextEntityType;
  /** Per-action attribution table showing grants for each action */
  actions: Record<EntityActionType, ActionAttribution>;
  /** Simple boolean map derived from actions (true if action.enabled) */
  can: Record<EntityActionType, boolean>;
  /** First membership from primaryContext, or null if none found */
  membership: T | null;
}

/**
 * Context builder for fluent access policy configuration.
 * Maps entity roles to their permission setters.
 */
export type ContextPolicyBuilder = {
  [R in EntityRole]: (permissions: EntityActionPermissions) => void;
};

/**
 * Configuration passed to access policy callback.
 */
export interface AccessPolicyConfiguration {
  subject: { name: EntityType };
  contexts: Record<ContextEntityType, ContextPolicyBuilder>;
}

/**
 * Callback function for configuring access policies.
 */
export type AccessPolicyCallback = (config: AccessPolicyConfiguration) => void;

/**
 * Options for permission checking.
 */
export interface PermissionCheckOptions {
  /** System role of the user (e.g., 'admin'). System admins get all permissions. */
  systemRole?: SystemRole | 'user';
}
