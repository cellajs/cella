import type { ContextEntityType, EntityActionType, EntityIdColumnKeys, ProductEntityType } from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

export type ContextEntityIdColumns = {
  [K in ContextEntityType as EntityIdColumnKeys[K]]?: string | null;
};

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
} & ContextEntityIdColumns;

/** Source that granted an action — either a context membership or an implicit relation. */
export type GrantSource =
  | { type: 'membership'; contextType: ContextEntityType; contextId: string; role: string }
  | { type: 'relation'; relation: 'owner' };

export interface ActionAttribution {
  enabled: boolean;
  grantedBy: GrantSource[];
}

export interface PermissionDecision<T extends MembershipBaseModel = MembershipBaseModel> {
  subject: {
    entityType: ContextEntityType | ProductEntityType;
    id?: string;
    contextIds: Partial<Record<ContextEntityType, string>>;
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
}
