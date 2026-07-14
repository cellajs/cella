import {
  type AccessPolicies,
  type Actor,
  accessPolicies,
  type ContextEntityType,
  elevatedRoles as configuredElevatedRoles,
  publicReadGrants as configuredPublicReadGrants,
  getPolicyPermissions,
  getSubjectPolicies,
  hierarchy,
  isRowCondition,
  type NormalizedPermissionValue,
  type PermissionTopology,
  type ProductEntityType,
  type PublicReadGrants,
  publicRow,
  type RowCondition,
} from 'shared';
import { AppError } from '#/core/error';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/** The `read` policy value a role grants for the entity type within the given context. */
const roleReadValue = (
  policies: AccessPolicies,
  entityType: ProductEntityType,
  contextType: ContextEntityType,
  role: string,
): NormalizedPermissionValue => {
  const subjectPolicies = getSubjectPolicies(entityType, policies);
  const permissions = getPolicyPermissions(subjectPolicies, contextType, role);
  return permissions?.read ?? 0;
};

/**
 * A row-conditional slice of the caller's readable scope: rows within `subContextIds`
 * (undefined = org-wide) are readable only where `condition` matches.
 * Compiled to SQL by `buildCollectionReadWhere` (`row-predicates.ts`).
 * `contextType` is the grant's level; absent = the entity's home context (sub-context
 * column) — the shape every pre-deep-chain caller produced.
 */
export interface ConditionalScope {
  condition: RowCondition;
  subContextIds: string[] | undefined;
  contextType?: ContextEntityType;
  /** Home-scoped grant (elevatedRoles): these levels' columns must be NULL as well. */
  deeperContexts?: ContextEntityType[];
}

/**
 * An unconditional grant at an intermediate ancestor level (deep chains only, e.g.
 * course/courseSection between organization and an item's home project): rows are
 * scoped by THAT level's own id column. Root grants stay org-wide and home grants
 * stay in `subContextIds`, so two-level forks never produce these. With `elevatedRoles`
 * configured, only subtree-scoped roles land here.
 */
export interface AncestorScope {
  contextType: ContextEntityType;
  subContextIds: string[];
}

/**
 * A HOME-scoped unconditional grant (elevatedRoles): rows homed exactly at this level —
 * that level's id column matches AND every more-specific ancestor column is NULL.
 * Produced only when `elevatedRoles` is configured, for roles outside the list.
 */
export interface HomeScope {
  contextType: ContextEntityType;
  subContextIds: string[];
  /** The chain levels more specific than `contextType` (their columns must be NULL). */
  deeperContexts: ContextEntityType[];
}

/** Accumulator for scope resolution: unconditional ids + per-condition ids, org-wide flags. */
interface ScopeAccumulator {
  unconditionalOrgWide: boolean;
  unconditionalIds: Set<string>;
  /** Unconditional grants at intermediate ancestor levels (deep chains), keyed by context type. */
  ancestorUnconditional: Map<ContextEntityType, Set<string>>;
  /** HOME-scoped unconditional grants (elevatedRoles), keyed by context type. */
  homeScoped: Map<ContextEntityType, Set<string>>;
  /** Keyed by `${condition name}:${level}:${homeOnly}`; conditions sharing a name must be the same rule. */
  conditional: Map<
    string,
    {
      condition: RowCondition;
      contextType?: ContextEntityType;
      homeOnly: boolean;
      orgWide: boolean;
      ids: Set<string>;
    }
  >;
}

/**
 * Resolve the caller's readable scope for a product entity within an organization.
 *
 * - Unconditional grants (`read: 1`) widen the plain sub-context scope, as before.
 * - Row-conditional grants (`read: <condition>`, e.g. `'own'`) contribute a
 *   {@link ConditionalScope}: those contexts' rows are readable where the condition
 *   matches. This makes condition-only roles listable at all; a role with only
 *   `read: 'own'` otherwise contributes no unconditional scope.
 */
const resolveScopes = (
  policies: AccessPolicies,
  memberships: MembershipBaseModel[],
  entityType: ProductEntityType,
  organizationId: string,
  elevatedRoles: readonly string[] | undefined,
  ancestors: readonly ContextEntityType[], // most-specific → root, e.g. [project, course, organization]
  publicGrants: PublicReadGrants | undefined,
): ScopeAccumulator => {
  const rootContext = ancestors.at(-1) ?? null; // organization
  const subContextType = ancestors.find((context) => context !== rootContext) ?? null; // home context, e.g. project

  // Grant scoping: with elevatedRoles configured, a non-elevated role's grant speaks only
  // for rows HOMED at its level. Grants at the deepest level are home-exact by
  // construction; root/intermediate grants of non-elevated roles become home-scoped.
  const isHomeScopedGrant = (contextType: ContextEntityType, role: string): boolean =>
    elevatedRoles !== undefined && !elevatedRoles.includes(role) && contextType !== subContextType;

  const acc: ScopeAccumulator = {
    unconditionalOrgWide: false,
    unconditionalIds: new Set(),
    ancestorUnconditional: new Map(),
    homeScoped: new Map(),
    conditional: new Map(),
  };

  const addConditional = (
    condition: RowCondition,
    contextId: string | null,
    contextType?: ContextEntityType,
    homeOnly = false,
  ) => {
    const key = `${condition.name}:${contextType ?? ''}:${homeOnly}`;
    const entry = acc.conditional.get(key) ?? {
      condition,
      contextType,
      homeOnly,
      orgWide: false,
      ids: new Set<string>(),
    };
    if (contextId === null) entry.orgWide = true;
    else entry.ids.add(contextId);
    acc.conditional.set(key, entry);
  };

  const addUnconditional = (contextType: ContextEntityType, role: string, contextId: string | null) => {
    // Non-elevated roles above the deepest level scope to rows HOMED at their grant level
    if (isHomeScopedGrant(contextType, role)) {
      const ids = acc.homeScoped.get(contextType) ?? new Set<string>();
      ids.add(contextId ?? organizationId);
      acc.homeScoped.set(contextType, ids);
      return;
    }
    if (contextId === null) acc.unconditionalOrgWide = true;
    else if (contextType === subContextType) acc.unconditionalIds.add(contextId);
    else {
      // Intermediate ancestor level (deep chains): scoped by that level's own id column.
      const ids = acc.ancestorUnconditional.get(contextType) ?? new Set<string>();
      ids.add(contextId);
      acc.ancestorUnconditional.set(contextType, ids);
    }
  };

  for (const membership of memberships) {
    // Root-context (e.g. organization) grant → org-wide scope (or org-homed rows only,
    // for non-elevated roles).
    if (rootContext && membership.contextType === rootContext && membership.contextId === organizationId) {
      const value = roleReadValue(policies, entityType, rootContext, membership.role);
      if (value === 1) addUnconditional(rootContext, membership.role, null);
      else if (isRowCondition(value))
        addConditional(value, null, undefined, isHomeScopedGrant(rootContext, membership.role));
      continue;
    }

    // Any non-root ancestor grant (home context or, in deep chains, an intermediate
    // level like course/courseSection) → scope to those ids within this organization.
    // Each grant is later filtered by its OWN level's id column; on tables with
    // denormalized ancestor columns an intermediate id covers every row physically
    // below it (single-row checks walk the same chain — see getAllDecisions).
    if (
      membership.organizationId === organizationId &&
      membership.contextId &&
      membership.contextType !== rootContext &&
      ancestors.includes(membership.contextType)
    ) {
      const grantLevel = membership.contextType as ContextEntityType;
      const value = roleReadValue(policies, entityType, grantLevel, membership.role);
      if (value === 1) addUnconditional(grantLevel, membership.role, membership.contextId);
      else if (isRowCondition(value))
        addConditional(
          value,
          membership.contextId,
          grantLevel === subContextType ? undefined : grantLevel,
          isHomeScopedGrant(grantLevel, membership.role),
        );
    }
  }

  // Public read grant: membership-INDEPENDENT, so it is added outside the membership walk —
  // a caller with no membership scope at all can still read public rows. Modelled as an
  // org-wide conditional slice (`publicAt IS NOT NULL`), which means it rides the exact same
  // compile path as policy row conditions and needs no special case downstream.
  if (publicGrants?.[entityType]) addConditional(publicRow, null);

  return acc;
};

/**
 * Result of resolving the effective scope filter for a collection read.
 *
 * Unconditional scope (rows readable outright):
 * - `subContextIds === undefined` → no sub-context filter (org-wide read, e.g. org admin).
 * - `subContextIds === []` → no unconditional scope.
 * - `subContextIds === [..]` → restrict rows to these sub-context ids.
 *
 * Conditional scopes (`conditionalScopes`): additional rows readable where a row
 * condition matches (OR-ed with the unconditional scope). Empty for callers whose roles
 * carry no row-conditional read grants, existing call sites that only consume
 * `subContextIds` keep their exact previous behavior.
 *
 * A read is empty only when `subContextIds` is `[]` AND `conditionalScopes`,
 * `ancestorScopes` and `homeScopes` are all empty.
 */
export interface CollectionReadFilter {
  subContextIds: string[] | undefined;
  conditionalScopes: ConditionalScope[];
  /**
   * Unconditional grants at intermediate ancestor levels (deep chains; aggregate reads
   * only — `requested` narrowing stays home-level). OR-ed with everything else, each
   * scoped by its own level's id column.
   */
  ancestorScopes?: AncestorScope[];
  /**
   * HOME-scoped grants (elevatedRoles; aggregate reads only): rows homed exactly at
   * the grant's level. OR-ed with everything else.
   */
  homeScopes?: HomeScope[];
}

/** Whether the resolved filter yields no readable rows at all (op should return an empty list). */
export const hasNoReadScope = (filter: CollectionReadFilter): boolean => {
  return (
    filter.subContextIds !== undefined &&
    filter.subContextIds.length === 0 &&
    filter.conditionalScopes.length === 0 &&
    (filter.ancestorScopes?.length ?? 0) === 0 &&
    (filter.homeScopes?.length ?? 0) === 0
  );
};

/** Chain levels more specific than `contextType` within the entity's ancestor chain. */
const deeperContextsOf = (orderedContexts: readonly ContextEntityType[], contextType: ContextEntityType) => {
  const index = orderedContexts.indexOf(contextType);
  return index > 0 ? [...orderedContexts.slice(0, index)] : [];
};

const toConditionalScopes = (
  acc: ScopeAccumulator,
  orderedContexts: readonly ContextEntityType[],
): ConditionalScope[] => {
  // Org-wide unconditional scope subsumes every conditional slice.
  if (acc.unconditionalOrgWide) return [];

  const scopes: ConditionalScope[] = [];
  for (const { condition, contextType, homeOnly, orgWide, ids } of acc.conditional.values()) {
    // Home-scoped conditional slices additionally require the deeper columns NULL
    const deeper = homeOnly
      ? deeperContextsOf(orderedContexts, contextType ?? (orderedContexts.at(-1) as ContextEntityType))
      : undefined;
    if (orgWide) {
      scopes.push({ condition, subContextIds: undefined, ...(deeper?.length && { deeperContexts: deeper }) });
      continue;
    }
    // Intermediate-level slices keep their own id space (scoped by their own column).
    if (contextType) {
      if (ids.size > 0)
        scopes.push({
          condition,
          subContextIds: [...ids],
          contextType,
          ...(deeper?.length && { deeperContexts: deeper }),
        });
      continue;
    }
    // Ids already unconditionally readable don't need the conditional slice.
    const remaining = [...ids].filter((id) => !acc.unconditionalIds.has(id));
    if (remaining.length > 0) scopes.push({ condition, subContextIds: remaining });
  }
  return scopes;
};

const toAncestorScopes = (acc: ScopeAccumulator): AncestorScope[] => {
  // Org-wide unconditional scope subsumes every ancestor slice.
  if (acc.unconditionalOrgWide) return [];

  const scopes: AncestorScope[] = [];
  for (const [contextType, ids] of acc.ancestorUnconditional) {
    if (ids.size > 0) scopes.push({ contextType, subContextIds: [...ids] });
  }
  return scopes;
};

const toHomeScopes = (acc: ScopeAccumulator, orderedContexts: readonly ContextEntityType[]): HomeScope[] => {
  // Org-wide unconditional scope subsumes every home slice.
  if (acc.unconditionalOrgWide) return [];

  const scopes: HomeScope[] = [];
  for (const [contextType, ids] of acc.homeScoped) {
    if (ids.size > 0)
      scopes.push({
        contextType,
        subContextIds: [...ids],
        deeperContexts: deeperContextsOf(orderedContexts, contextType),
      });
  }
  return scopes;
};

/** Everything a collection-read scope resolution depends on. */
export interface CollectionReadScopeInput {
  /** Policy set. The bound wrapper injects the app's; parity tests pass synthetic ones. */
  policies: AccessPolicies;
  memberships: MembershipBaseModel[];
  /** The product entity being listed. */
  entityType: ProductEntityType;
  /** The organization the request is scoped to. */
  organizationId: string;
  /** Who is asking. Carries the system-admin bypass; required so no call site can forget it. */
  actor: Actor;
  /**
   * Explicit sub-context narrowing already resolved from the request:
   * - `subContextId`: a single explicit id (e.g. `projectId` query param).
   * - `subContextIds`: a pre-resolved set (e.g. all project ids of a requested workspace).
   * When neither is provided the read is an aggregate over the caller's readable scope.
   */
  requested?: { subContextId?: string; subContextIds?: string[] };
  /** Grant scoping role list (see `shared/config/permissions-config.ts`). */
  elevatedRoles?: readonly string[];
  /** Subject-level public read grants (see `shared/src/permissions/public-read.ts`). */
  publicGrants?: PublicReadGrants;
  /**
   * Hierarchy override, the same seam `getAllDecisions(…, { topology })` exposes. Defaults to
   * the app's real hierarchy; parity tests pass a synthetic one to exercise deep chains a
   * 2-level config structurally cannot reach.
   */
  topology?: PermissionTopology;
}

/**
 * Resolve the effective scope filter for a product collection read, scoping the result to the
 * caller's access. Binds the app's policies, `elevatedRoles` and public read grants, so
 * handlers supply only the caller and the request.
 *
 * @throws AppError 403 `forbidden` when an explicitly requested id is outside the caller's
 *   readable scope entirely (neither unconditional nor covered by any conditional scope).
 */
export const resolveCollectionReadFilter = (
  memberships: MembershipBaseModel[],
  entityType: ProductEntityType,
  organizationId: string,
  actor: Actor,
  requested?: { subContextId?: string; subContextIds?: string[] },
): CollectionReadFilter =>
  resolveCollectionReadFilterForPolicies({
    policies: accessPolicies,
    memberships,
    entityType,
    organizationId,
    actor,
    requested,
    elevatedRoles: configuredElevatedRoles,
    publicGrants: configuredPublicReadGrants,
  });

/**
 * Same as {@link resolveCollectionReadFilter} but against an explicit policy set, mirroring
 * `getAllDecisions(policies, …)`. Used by the check/SQL parity property test to exercise
 * synthetic policies; handlers use the bound wrapper above.
 */
export const resolveCollectionReadFilterForPolicies = ({
  policies,
  memberships,
  entityType,
  organizationId,
  actor,
  requested,
  elevatedRoles,
  publicGrants,
  topology,
}: CollectionReadScopeInput): CollectionReadFilter => {
  // System admins read every row the organization contains. This mirrors the engine's own
  // short-circuit (`getAllDecisions` grants all actions before consulting memberships): a
  // sysadmin passes `orgGuard` with NO membership, so without this they would resolve to an
  // empty scope and get an empty list — while single-row reads of the same rows succeed.
  if (!('anonymous' in actor) && actor.isSystemAdmin) {
    return { subContextIds: undefined, conditionalScopes: [] };
  }

  const topoHierarchy = topology?.hierarchy ?? hierarchy;
  const orderedContexts = topoHierarchy.getOrderedAncestors(entityType) as ContextEntityType[];
  const acc = resolveScopes(
    policies,
    memberships,
    entityType,
    organizationId,
    elevatedRoles,
    orderedContexts,
    publicGrants,
  );
  const conditionalScopes = toConditionalScopes(acc, orderedContexts);
  const rootContext = orderedContexts.at(-1) ?? null;
  const homeContext = orderedContexts.find((context) => context !== rootContext) ?? null;
  const ancestorScopes = toAncestorScopes(acc);
  const homeScopes = toHomeScopes(acc, orderedContexts);

  const withScopes = (
    filter: Omit<CollectionReadFilter, 'ancestorScopes' | 'homeScopes'>,
    ancestors: AncestorScope[] = ancestorScopes,
    homes: HomeScope[] = homeScopes,
  ): CollectionReadFilter => {
    let base: CollectionReadFilter = ancestors.length > 0 ? { ...filter, ancestorScopes: ancestors } : filter;
    if (homes.length > 0) base = { ...base, homeScopes: homes };
    return base;
  };

  const unconditionallyReadable = (id: string): boolean => acc.unconditionalOrgWide || acc.unconditionalIds.has(id);
  /** Is this conditional entry scoped by an intermediate level's own column? */
  const isIntermediate = (contextType: ContextEntityType | undefined): boolean =>
    contextType !== undefined && contextType !== homeContext && contextType !== rootContext;

  // `requested` narrowing stays strictly home-level (pre-deep-chain semantics):
  // intermediate-level entries are DROPPED here — a requested-id read widened by an
  // intermediate grant would leak rows outside the requested set unless every caller
  // also ANDs its own placement filter. Deep-chain list ops therefore skip `requested`
  // and apply placement as an explicit filter on top of the aggregate WHERE.
  const conditionalScopesFor = (ids: string[]): ConditionalScope[] => {
    const remaining = ids.filter((id) => !unconditionallyReadable(id));
    if (remaining.length === 0) return [];
    return (
      conditionalScopes
        // Intermediate + home-scoped slices are dropped (requested narrowing is home-level)
        .filter((scope) => !isIntermediate(scope.contextType) && !scope.deeperContexts)
        .map(({ condition, subContextIds }) => ({
          condition,
          subContextIds: subContextIds === undefined ? remaining : remaining.filter((id) => subContextIds.includes(id)),
        }))
        .filter((scope) => scope.subContextIds.length > 0)
    );
  };

  // Explicit single id (e.g. ?projectId=…): must be within the caller's readable scope.
  if (requested?.subContextId !== undefined) {
    const id = requested.subContextId;
    if (unconditionallyReadable(id)) return { subContextIds: [id], conditionalScopes: [] };

    const scopes = conditionalScopesFor([id]);
    if (scopes.length === 0) {
      throw new AppError(403, 'forbidden', 'warn', { entityType });
    }
    return { subContextIds: [], conditionalScopes: scopes };
  }

  // Explicit set (e.g. all projects of a workspace): intersect with the caller's scope.
  if (requested?.subContextIds !== undefined) {
    const unconditional = requested.subContextIds.filter((id) => unconditionallyReadable(id));
    return { subContextIds: unconditional, conditionalScopes: conditionalScopesFor(requested.subContextIds) };
  }

  // Aggregate read: org-wide for root-level grants, otherwise the caller's readable
  // sub-contexts plus any intermediate ancestor / home scopes.
  return withScopes({
    subContextIds: acc.unconditionalOrgWide ? undefined : [...acc.unconditionalIds],
    conditionalScopes,
  });
};
