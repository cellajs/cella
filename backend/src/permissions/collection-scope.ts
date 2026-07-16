import {
  type AccessPolicies,
  type Actor,
  accessPolicies,
  type ChannelEntityType,
  elevatedRoles as configuredElevatedRoles,
  publicReadGrants as configuredPublicReadGrants,
  type EntityRole,
  getPolicyPermissions,
  getSubjectPolicies,
  hierarchy,
  isRowCondition,
  type NormalizedPermissionValue,
  type PermissionTopology,
  type ProductEntityType,
  type PublicReadGrants,
  type RowConditionName,
} from 'shared';
import { AppError } from '#/core/error';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/** The `read` policy value a role grants for the entity type within the given context. */
const roleReadValue = (
  policies: AccessPolicies,
  entityType: ProductEntityType,
  channelType: ChannelEntityType,
  role: EntityRole,
): NormalizedPermissionValue => {
  const subjectPolicies = getSubjectPolicies(entityType, policies);
  const permissions = getPolicyPermissions(subjectPolicies, channelType, role);
  return permissions?.read ?? 0;
};

/**
 * A row-conditional slice of the caller's readable scope: rows within `subChannelIds`
 * (undefined = org-wide) are readable only where `condition` matches.
 * Compiled to SQL by `buildCollectionReadWhere` (`row-predicates.ts`).
 * `channelType` is the grant's level; absent = the entity's home context (sub-context
 * column) — the shape every pre-deep-chain caller produced.
 */
export interface ConditionalScope {
  condition: RowConditionName;
  subChannelIds: string[] | undefined;
  channelType?: ChannelEntityType;
  /** Home-scoped grant (elevatedRoles): these levels' columns must be NULL as well. */
  deeperChannels?: ChannelEntityType[];
}

/**
 * An unconditional grant at an intermediate ancestor level (deep chains only, e.g.
 * course/courseSection between organization and an item's home project): rows are
 * scoped by THAT level's own id column. Root grants stay org-wide and home grants
 * stay in `subChannelIds`, so two-level forks never produce these. With `elevatedRoles`
 * configured, only subtree-scoped roles land here.
 */
export interface AncestorScope {
  channelType: ChannelEntityType;
  subChannelIds: string[];
}

/**
 * A HOME-scoped unconditional grant (elevatedRoles): rows homed exactly at this level —
 * that level's id column matches AND every more-specific ancestor column is NULL.
 * Produced only when `elevatedRoles` is configured, for roles outside the list.
 */
export interface HomeScope {
  channelType: ChannelEntityType;
  subChannelIds: string[];
  /** The chain levels more specific than `channelType` (their columns must be NULL). */
  deeperChannels: ChannelEntityType[];
}

/** Accumulator for scope resolution: unconditional ids + per-condition ids, org-wide flags. */
interface ScopeAccumulator {
  unconditionalOrgWide: boolean;
  unconditionalIds: Set<string>;
  /** Unconditional grants at intermediate ancestor levels (deep chains), keyed by context type. */
  ancestorUnconditional: Map<ChannelEntityType, Set<string>>;
  /** HOME-scoped unconditional grants (elevatedRoles), keyed by context type. */
  homeScoped: Map<ChannelEntityType, Set<string>>;
  /** Keyed by `${condition name}:${level}:${homeOnly}`; the name uniquely identifies the rule. */
  conditional: Map<
    string,
    {
      condition: RowConditionName;
      channelType?: ChannelEntityType;
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
  ancestors: readonly ChannelEntityType[], // most-specific → root, e.g. [project, course, organization]
  publicGrants: PublicReadGrants | undefined,
): ScopeAccumulator => {
  const rootChannel = ancestors.at(-1) ?? null; // organization
  const subChannelType = ancestors.find((context) => context !== rootChannel) ?? null; // home context, e.g. project

  // Grant scoping: with elevatedRoles configured, a non-elevated role's grant speaks only
  // for rows HOMED at its level. Grants at the deepest level are home-exact by
  // construction; root/intermediate grants of non-elevated roles become home-scoped.
  const isHomeScopedGrant = (channelType: ChannelEntityType, role: EntityRole): boolean =>
    elevatedRoles !== undefined && !elevatedRoles.includes(role) && channelType !== subChannelType;

  const acc: ScopeAccumulator = {
    unconditionalOrgWide: false,
    unconditionalIds: new Set(),
    ancestorUnconditional: new Map(),
    homeScoped: new Map(),
    conditional: new Map(),
  };

  const addConditional = (
    condition: RowConditionName,
    channelId: string | null,
    channelType?: ChannelEntityType,
    homeOnly = false,
  ) => {
    const key = `${condition}:${channelType ?? ''}:${homeOnly}`;
    const entry = acc.conditional.get(key) ?? {
      condition,
      channelType,
      homeOnly,
      orgWide: false,
      ids: new Set<string>(),
    };
    if (channelId === null) entry.orgWide = true;
    else entry.ids.add(channelId);
    acc.conditional.set(key, entry);
  };

  const addUnconditional = (channelType: ChannelEntityType, role: EntityRole, channelId: string | null) => {
    // Non-elevated roles above the deepest level scope to rows HOMED at their grant level
    if (isHomeScopedGrant(channelType, role)) {
      const ids = acc.homeScoped.get(channelType) ?? new Set<string>();
      ids.add(channelId ?? organizationId);
      acc.homeScoped.set(channelType, ids);
      return;
    }
    if (channelId === null) acc.unconditionalOrgWide = true;
    else if (channelType === subChannelType) acc.unconditionalIds.add(channelId);
    else {
      // Intermediate ancestor level (deep chains): scoped by that level's own id column.
      const ids = acc.ancestorUnconditional.get(channelType) ?? new Set<string>();
      ids.add(channelId);
      acc.ancestorUnconditional.set(channelType, ids);
    }
  };

  for (const membership of memberships) {
    // Root-context (e.g. organization) grant → org-wide scope (or org-homed rows only,
    // for non-elevated roles).
    if (rootChannel && membership.channelType === rootChannel && membership.channelId === organizationId) {
      const value = roleReadValue(policies, entityType, rootChannel, membership.role);
      if (value === 1) addUnconditional(rootChannel, membership.role, null);
      else if (isRowCondition(value))
        addConditional(value, null, undefined, isHomeScopedGrant(rootChannel, membership.role));
      continue;
    }

    // Any non-root ancestor grant (home context or, in deep chains, an intermediate
    // level like course/courseSection) → scope to those ids within this organization.
    // Each grant is later filtered by its OWN level's id column; on tables with
    // denormalized ancestor columns an intermediate id covers every row physically
    // below it (single-row checks walk the same chain — see getAllDecisions).
    if (
      membership.organizationId === organizationId &&
      membership.channelId &&
      membership.channelType !== rootChannel &&
      ancestors.includes(membership.channelType)
    ) {
      const grantLevel = membership.channelType as ChannelEntityType;
      const value = roleReadValue(policies, entityType, grantLevel, membership.role);
      if (value === 1) addUnconditional(grantLevel, membership.role, membership.channelId);
      else if (isRowCondition(value))
        addConditional(
          value,
          membership.channelId,
          grantLevel === subChannelType ? undefined : grantLevel,
          isHomeScopedGrant(grantLevel, membership.role),
        );
    }
  }

  // Public read grant: membership-INDEPENDENT, so it is added outside the membership walk —
  // a caller with no membership scope at all can still read public rows. Modelled as an
  // org-wide conditional slice (`publicAt IS NOT NULL`), which means it rides the exact same
  // compile path as policy row conditions and needs no special case downstream.
  if (publicGrants?.[entityType]) addConditional('public', null);

  return acc;
};

/**
 * Result of resolving the effective scope filter for a collection read.
 *
 * Unconditional scope (rows readable outright):
 * - `subChannelIds === undefined` → no sub-context filter (org-wide read, e.g. org admin).
 * - `subChannelIds === []` → no unconditional scope.
 * - `subChannelIds === [..]` → restrict rows to these sub-context ids.
 *
 * Conditional scopes (`conditionalScopes`): additional rows readable where a row
 * condition matches (OR-ed with the unconditional scope). Empty for callers whose roles
 * carry no row-conditional read grants, existing call sites that only consume
 * `subChannelIds` keep their exact previous behavior.
 *
 * A read is empty only when `subChannelIds` is `[]` AND `conditionalScopes`,
 * `ancestorScopes` and `homeScopes` are all empty.
 */
export interface CollectionReadFilter {
  subChannelIds: string[] | undefined;
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
    filter.subChannelIds !== undefined &&
    filter.subChannelIds.length === 0 &&
    filter.conditionalScopes.length === 0 &&
    (filter.ancestorScopes?.length ?? 0) === 0 &&
    (filter.homeScopes?.length ?? 0) === 0
  );
};

/** Chain levels more specific than `channelType` within the entity's ancestor chain. */
const deeperChannelsOf = (orderedChannels: readonly ChannelEntityType[], channelType: ChannelEntityType) => {
  const index = orderedChannels.indexOf(channelType);
  return index > 0 ? [...orderedChannels.slice(0, index)] : [];
};

const toConditionalScopes = (
  acc: ScopeAccumulator,
  orderedChannels: readonly ChannelEntityType[],
): ConditionalScope[] => {
  // Org-wide unconditional scope subsumes every conditional slice.
  if (acc.unconditionalOrgWide) return [];

  const scopes: ConditionalScope[] = [];
  for (const { condition, channelType, homeOnly, orgWide, ids } of acc.conditional.values()) {
    // Home-scoped conditional slices additionally require the deeper columns NULL
    const deeper = homeOnly
      ? deeperChannelsOf(orderedChannels, channelType ?? (orderedChannels.at(-1) as ChannelEntityType))
      : undefined;
    if (orgWide) {
      scopes.push({ condition, subChannelIds: undefined, ...(deeper?.length && { deeperChannels: deeper }) });
      continue;
    }
    // Intermediate-level slices keep their own id space (scoped by their own column).
    if (channelType) {
      if (ids.size > 0)
        scopes.push({
          condition,
          subChannelIds: [...ids],
          channelType,
          ...(deeper?.length && { deeperChannels: deeper }),
        });
      continue;
    }
    // Ids already unconditionally readable don't need the conditional slice.
    const remaining = [...ids].filter((id) => !acc.unconditionalIds.has(id));
    if (remaining.length > 0) scopes.push({ condition, subChannelIds: remaining });
  }
  return scopes;
};

const toAncestorScopes = (acc: ScopeAccumulator): AncestorScope[] => {
  // Org-wide unconditional scope subsumes every ancestor slice.
  if (acc.unconditionalOrgWide) return [];

  const scopes: AncestorScope[] = [];
  for (const [channelType, ids] of acc.ancestorUnconditional) {
    if (ids.size > 0) scopes.push({ channelType, subChannelIds: [...ids] });
  }
  return scopes;
};

const toHomeScopes = (acc: ScopeAccumulator, orderedChannels: readonly ChannelEntityType[]): HomeScope[] => {
  // Org-wide unconditional scope subsumes every home slice.
  if (acc.unconditionalOrgWide) return [];

  const scopes: HomeScope[] = [];
  for (const [channelType, ids] of acc.homeScoped) {
    if (ids.size > 0)
      scopes.push({
        channelType,
        subChannelIds: [...ids],
        deeperChannels: deeperChannelsOf(orderedChannels, channelType),
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
   * - `subChannelId`: a single explicit id (e.g. `projectId` query param).
   * - `subChannelIds`: a pre-resolved set (e.g. all project ids of a requested workspace).
   * When neither is provided the read is an aggregate over the caller's readable scope.
   */
  requested?: { subChannelId?: string; subChannelIds?: string[] };
  /**
   * Grant scoping role list.
   * @see shared/config/permissions-config.ts
   */
  elevatedRoles?: readonly string[];
  /**
   * Subject-level public read grants.
   * @see shared/src/permissions/public-read.ts
   */
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
  requested?: { subChannelId?: string; subChannelIds?: string[] },
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
    // An explicitly requested sub-context still narrows the read — sysadmin widens
    // WHO can read, never WHAT a placement-filtered list returns.
    if (requested?.subChannelId !== undefined)
      return { subChannelIds: [requested.subChannelId], conditionalScopes: [] };
    if (requested?.subChannelIds !== undefined)
      return { subChannelIds: requested.subChannelIds, conditionalScopes: [] };
    return { subChannelIds: undefined, conditionalScopes: [] };
  }

  const topoHierarchy = topology?.hierarchy ?? hierarchy;
  const orderedChannels = topoHierarchy.getOrderedAncestors(entityType) as ChannelEntityType[];
  const acc = resolveScopes(
    policies,
    memberships,
    entityType,
    organizationId,
    elevatedRoles,
    orderedChannels,
    publicGrants,
  );
  const conditionalScopes = toConditionalScopes(acc, orderedChannels);
  const rootChannel = orderedChannels.at(-1) ?? null;
  const homeChannel = orderedChannels.find((context) => context !== rootChannel) ?? null;
  const ancestorScopes = toAncestorScopes(acc);
  const homeScopes = toHomeScopes(acc, orderedChannels);

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
  const isIntermediate = (channelType: ChannelEntityType | undefined): boolean =>
    channelType !== undefined && channelType !== homeChannel && channelType !== rootChannel;

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
        .filter((scope) => !isIntermediate(scope.channelType) && !scope.deeperChannels)
        .map(({ condition, subChannelIds }) => ({
          condition,
          subChannelIds: subChannelIds === undefined ? remaining : remaining.filter((id) => subChannelIds.includes(id)),
        }))
        .filter((scope) => scope.subChannelIds.length > 0)
    );
  };

  // Explicit single id (e.g. ?projectId=…): must be within the caller's readable scope.
  if (requested?.subChannelId !== undefined) {
    const id = requested.subChannelId;
    if (unconditionallyReadable(id)) return { subChannelIds: [id], conditionalScopes: [] };

    const scopes = conditionalScopesFor([id]);
    if (scopes.length === 0) {
      throw new AppError(403, 'forbidden', 'warn', { entityType });
    }
    return { subChannelIds: [], conditionalScopes: scopes };
  }

  // Explicit set (e.g. all projects of a workspace): intersect with the caller's scope.
  if (requested?.subChannelIds !== undefined) {
    const unconditional = requested.subChannelIds.filter((id) => unconditionallyReadable(id));
    return { subChannelIds: unconditional, conditionalScopes: conditionalScopesFor(requested.subChannelIds) };
  }

  // Aggregate read: org-wide for root-level grants, otherwise the caller's readable
  // sub-contexts plus any intermediate ancestor / home scopes.
  return withScopes({
    subChannelIds: acc.unconditionalOrgWide ? undefined : [...acc.unconditionalIds],
    conditionalScopes,
  });
};
