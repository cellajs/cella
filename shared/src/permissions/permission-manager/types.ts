import type { ContextEntityType, EntityActionType, EntityIdColumnKeys, EntityRole, ProductEntityType } from '../../../types';

export type ContextEntityIdColumns = {
  [K in ContextEntityType as EntityIdColumnKeys[K]]: string | null;
};

export type ContextScope = Partial<Record<ContextEntityType, string | null>>;

export type ResolvedContextIds = Partial<Record<ContextEntityType, string>>;

/**
 * Minimal structural shape the permission engine needs from a membership.
 *
 * The engine only reads `contextType`, `contextId` and `role`. Backend and fork models
 * (e.g. `MembershipBaseModel`) extend this freely with extra fields the engine ignores,
 * so both tiers can pass their own model with zero change.
 */
export interface PermissionMembership {
  contextType: ContextEntityType;
  contextId: string;
  role: EntityRole;
}

/**
 * Subject (entity) for permission evaluation.
 *
 * In Zanzibar terms, this represents the "object" being accessed. The `createdBy` field
 * enables an implicit "owner" relation — when a policy uses `'own'`, the engine checks
 * `subject.createdBy === options.userId` to determine if the actor is the owner.
 *
 * Future: This could be extended to carry explicit relation tuples (e.g., `relations: Array<{ type, userId }>`)
 * for a full Zanzibar model without changing the outer interface.
 */
export type SubjectForPermission = {
  entityType: ContextEntityType | ProductEntityType;
  id?: string;
  /** The user who created this entity. Enables implicit "owner" relation for `'own'` policies. */
  createdBy?: string | null;
  /** Ancestor context IDs keyed by context entity type. `null` means explicitly not scoped to that context. */
  contextIds: ContextScope;
};

/** Source that granted an action — either a context membership or an implicit relation. */
export type GrantSource =
  | { type: 'membership'; contextType: ContextEntityType; contextId: string; role: string }
  | { type: 'relation'; relation: 'owner' };

export interface ActionAttribution {
  enabled: boolean;
  grantedBy: GrantSource[];
}

export interface PermissionDecision<T extends PermissionMembership = PermissionMembership> {
  subject: {
    entityType: ContextEntityType | ProductEntityType;
    id?: string;
    contextIds: ResolvedContextIds;
  };
  orderedContexts: ContextEntityType[];
  primaryContext: ContextEntityType;
  actions: Record<EntityActionType, ActionAttribution>;
  can: Record<EntityActionType, boolean>;
  membership: T | null;
}

/**
 * Options for permission checks.
 *
 * In Zanzibar terms, `userId` is the "subject" (actor) of the permission check.
 * Combined with `SubjectForPermission.createdBy`, this enables the implicit "owner" relation.
 */
export interface PermissionCheckOptions {
  isSystemAdmin?: boolean;
  /** The acting user's ID. Required when evaluating `'own'` policies (implicit owner relation). */
  userId?: string;
  /** When `true`, emit debug logging of the decision tree. Off by default to keep the engine quiet. */
  debug?: boolean;
}
