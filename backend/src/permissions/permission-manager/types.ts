import type {
  ContextEntityType,
  EntityActionType,
  EntityIdColumnKeys,
  EntityRole,
  EntityType,
  ProductEntityType,
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
 * Configuration for a context entity defining its roles and optional parent contexts.
 */
export interface ContextConfig {
  type: 'context';
  roles: readonly EntityRole[];
  parents?: readonly ContextEntityType[];
}

/**
 * Configuration for a product entity defining its parent contexts.
 */
export interface ProductConfig {
  type: 'product';
  parents: readonly ContextEntityType[];
}

/**
 * Entity configuration - either a context or product entity.
 */
export type EntityConfig = ContextConfig | ProductConfig;

/**
 * Full hierarchy configuration mapping entity types to their configurations.
 * All context entity types must be configured, product entity types are optional.
 */
export type HierarchyConfig = {
  [K in ContextEntityType]: ContextConfig;
} & {
  [K in ProductEntityType]?: ProductConfig;
};

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
  /** The user's role in this context */
  role: EntityRole;
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
    role: EntityRole;
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
  /** Context types checked in order (most specific to root) */
  relevantContexts: ContextEntityType[];
  /** The primary context where membership is captured */
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
