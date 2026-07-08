import type { ContextEntityType, EntityActionType, EntityIdColumnKeys, EntityRole, ProductEntityType } from '../../../types';
import type { PublicReadGrants, PublicReadMode } from '../public-read';
import type { RowRestrictions } from '../row-restrictions';
import type { HostDelegation } from '../types';
import type { PermissionTopology } from './topology';

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
 * enables an implicit "owner" relation: when a policy uses `'own'`, the engine checks
 * `subject.createdBy === options.userId` to determine if the actor is the owner.
 */
export type SubjectForPermission = {
  entityType: ContextEntityType | ProductEntityType;
  id?: string;
  /** The user who created this entity. Enables the built-in `own` row condition. */
  createdBy?: string | null;
  /** Ancestor context IDs keyed by context entity type. `null` means explicitly not scoped to that context. */
  contextIds: ContextScope;
  /**
   * Additional row fields for row-condition evaluation (see `row-conditions.ts`) and
   * public read grants (see `public-read.ts`). Only needed when a policy uses a rule
   * that reads columns beyond `createdBy`.
   */
  row?: Record<string, unknown>;
  /**
   * The parent context row's fields, for rules that depend on another row (e.g.
   * `publicRead: 'publicParent'`). Resolved by the caller once per request/event:
   * the engine never loads rows itself.
   */
  parentRow?: Record<string, unknown>;
  /**
   * The host product row's fields (hierarchy `host:`), for host-delegated decisions
   * (`delegateToHost`). Resolved by the caller like `parentRow`; without it, delegation
   * contributes nothing (fail closed).
   */
  hostRow?: Record<string, unknown>;
};

/**
 * Source that granted an action: a context membership, a row condition
 * (`relation` is the condition's name, e.g. `'own'`), or a public read grant.
 */
export type GrantSource =
  | { type: 'membership'; contextType: ContextEntityType; contextId: string; role: string }
  | { type: 'relation'; relation: string }
  | { type: 'public'; mode: PublicReadMode }
  | { type: 'host'; hostType: string };

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
  /**
   * Subject-level public read grants to evaluate (see `public-read.ts`). The
   * `checkPermission` wrapper injects the configured grants; pass explicitly only when
   * driving the engine with synthetic policies (tests).
   */
  publicGrants?: PublicReadGrants;
  /**
   * Subject-level row restrictions to evaluate (see `row-restrictions.ts`). Injected by
   * the `checkPermission` wrapper like `publicGrants`.
   */
  restrictions?: RowRestrictions;
  /**
   * Host-delegated actions per hosted entity type (`delegateToHost`). Injected by the
   * `checkPermission` wrapper like `publicGrants`.
   */
  hostDelegation?: HostDelegation;
  /**
   * Override the hierarchy/action topology the engine reads (defaults to the app's config).
   * Tests use this to exercise a synthetic hierarchy; see `shared/src/testing/wide-fixture.ts`.
   */
  topology?: PermissionTopology;
  /** When `true`, emit debug logging of the decision tree. Off by default to keep the engine quiet. */
  debug?: boolean;
}
