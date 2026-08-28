import {
  type Actor,
  hierarchy as appHierarchy,
  type ChannelEntityType,
  publicReadGrants as configuredPublicReadGrants,
  type EntityHierarchy,
  type EntityRole,
  getEntityPolicies,
  getPolicyPermissions,
  isRowCondition,
  type PolicyCell,
  type PolicyMatrix,
  type ProductEntityType,
  type PublicReadGrants,
  policyMatrix,
  type RowConditionName,
} from 'shared';
import { AppError } from '#/core/error';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

const roleReadValue = (
  policies: PolicyMatrix,
  entityType: ProductEntityType,
  channelType: ChannelEntityType,
  role: EntityRole,
): PolicyCell => {
  const entityPolicies = getEntityPolicies(entityType, policies);
  const permissions = getPolicyPermissions(entityPolicies, channelType, role);
  return permissions?.read ?? 0;
};

/** Row-conditional slice: rows in `channelIds` (undefined = org-wide) are readable only where `condition` matches. */
export interface ConditionalScope {
  condition: RowConditionName;
  channelIds: string[] | undefined;
  /** The grant's level; absent = the entity's home channel. */
  channelType?: ChannelEntityType;
  /** Home-scoped grant (non-elevated): these levels' columns must be NULL as well. */
  deeperChannels?: ChannelEntityType[];
}

/** Unconditional grant at an intermediate ancestor level: rows scoped by THAT level's own id column, not the home column. */
export interface IntermediateScope {
  channelType: ChannelEntityType;
  channelIds: string[];
}

/** A HOME-scoped grant (outside `elevatedGrants`): that level's column matches AND deeper ancestor columns are NULL. */
export interface HomeScope {
  channelType: ChannelEntityType;
  channelIds: string[];
  /** The chain levels more specific than `channelType` (their columns must be NULL). */
  deeperChannels: ChannelEntityType[];
}

/** Accumulator for scope resolution: unconditional ids + per-condition ids, org-wide flags. */
interface ScopeAccumulator {
  unconditionalOrgWide: boolean;
  unconditionalIds: Set<string>;
  /** Unconditional grants at intermediate ancestor levels (deep chains), keyed by channel type. */
  intermediateUnconditional: Map<ChannelEntityType, Set<string>>;
  /** HOME-scoped unconditional grants (non-elevated), keyed by channel type. */
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

/** The caller's readable scope. A role holding only `read: 'own'` contributes a {@link ConditionalScope}, so it can still list. */
const resolveScopes = (
  policies: PolicyMatrix,
  memberships: MembershipBaseModel[],
  entityType: ProductEntityType,
  organizationId: string,
  elevatedGrants: ReadonlySet<string> | undefined,
  ancestors: readonly ChannelEntityType[], // most-specific → root, e.g. [project, course, organization]
  publicGrants: PublicReadGrants | undefined,
): ScopeAccumulator => {
  const rootChannel = ancestors.at(-1) ?? null;
  const homeChannelType = ancestors.find((channel) => channel !== rootChannel) ?? null;

  // With elevatedGrants configured, a non-elevated grant speaks only for rows HOMED at its
  // level; deepest-level grants are home-exact already, so only higher levels carry the mark.
  const isHomeScopedGrant = (channelType: ChannelEntityType, role: EntityRole): boolean =>
    elevatedGrants !== undefined && !elevatedGrants.has(`${channelType}:${role}`) && channelType !== homeChannelType;

  const acc: ScopeAccumulator = {
    unconditionalOrgWide: false,
    unconditionalIds: new Set(),
    intermediateUnconditional: new Map(),
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
    if (isHomeScopedGrant(channelType, role)) {
      const ids = acc.homeScoped.get(channelType) ?? new Set<string>();
      ids.add(channelId ?? organizationId);
      acc.homeScoped.set(channelType, ids);
      return;
    }
    if (channelId === null) acc.unconditionalOrgWide = true;
    else if (channelType === homeChannelType) acc.unconditionalIds.add(channelId);
    else {
      const ids = acc.intermediateUnconditional.get(channelType) ?? new Set<string>();
      ids.add(channelId);
      acc.intermediateUnconditional.set(channelType, ids);
    }
  };

  for (const membership of memberships) {
    // Root-channel grant: org-wide scope, or org-homed rows only for non-elevated roles.
    if (rootChannel && membership.channelType === rootChannel && membership.channelId === organizationId) {
      const value = roleReadValue(policies, entityType, rootChannel, membership.role);
      if (value === 1) addUnconditional(rootChannel, membership.role, null);
      else if (isRowCondition(value))
        addConditional(value, null, undefined, isHomeScopedGrant(rootChannel, membership.role));
      continue;
    }

    // Non-root grants scope by their own denormalized ancestor id column, covering every physically nested row.
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
          grantLevel === homeChannelType ? undefined : grantLevel,
          isHomeScopedGrant(grantLevel, membership.role),
        );
    }
  }

  // Membership-independent public reads join as an org-wide conditional scope, through the same path as row conditions.
  if (publicGrants?.[entityType]) addConditional('public', null);

  return acc;
};

/** Effective collection-read scopes, OR-combined. Undefined `homeChannelIds` = org-wide, an empty array = no unconditional access. */
export interface CollectionReadFilter {
  homeChannelIds: string[] | undefined;
  conditionalScopes: ConditionalScope[];
  /** Unconditional grants at intermediate ancestor levels (aggregate reads only), each scoped by its own level's column. */
  intermediateScopes?: IntermediateScope[];
  /** HOME-scoped grants (non-elevated; aggregate reads only): rows homed exactly at the grant's level. */
  homeScopes?: HomeScope[];
}

/** Whether the resolved filter yields no readable rows at all (op should return an empty list). */
export const hasNoReadScope = (filter: CollectionReadFilter): boolean => {
  return (
    filter.homeChannelIds !== undefined &&
    filter.homeChannelIds.length === 0 &&
    filter.conditionalScopes.length === 0 &&
    (filter.intermediateScopes?.length ?? 0) === 0 &&
    (filter.homeScopes?.length ?? 0) === 0
  );
};

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
      scopes.push({ condition, channelIds: undefined, ...(deeper?.length && { deeperChannels: deeper }) });
      continue;
    }
    // Intermediate-level slices keep their own id space (scoped by their own column).
    if (channelType) {
      if (ids.size > 0)
        scopes.push({
          condition,
          channelIds: [...ids],
          channelType,
          ...(deeper?.length && { deeperChannels: deeper }),
        });
      continue;
    }
    // Ids already unconditionally readable don't need the conditional slice.
    const remaining = [...ids].filter((id) => !acc.unconditionalIds.has(id));
    if (remaining.length > 0) scopes.push({ condition, channelIds: remaining });
  }
  return scopes;
};

const toIntermediateScopes = (acc: ScopeAccumulator): IntermediateScope[] => {
  if (acc.unconditionalOrgWide) return [];

  const scopes: IntermediateScope[] = [];
  for (const [channelType, ids] of acc.intermediateUnconditional) {
    if (ids.size > 0) scopes.push({ channelType, channelIds: [...ids] });
  }
  return scopes;
};

const toHomeScopes = (acc: ScopeAccumulator, orderedChannels: readonly ChannelEntityType[]): HomeScope[] => {
  if (acc.unconditionalOrgWide) return [];

  const scopes: HomeScope[] = [];
  for (const [channelType, ids] of acc.homeScoped) {
    if (ids.size > 0)
      scopes.push({
        channelType,
        channelIds: [...ids],
        deeperChannels: deeperChannelsOf(orderedChannels, channelType),
      });
  }
  return scopes;
};

export interface CollectionReadScopeInput {
  /** Policy set. The bound wrapper injects the app's; parity tests pass synthetic ones. */
  policies: PolicyMatrix;
  memberships: MembershipBaseModel[];
  entityType: ProductEntityType;
  organizationId: string;
  /** Who is asking. Carries the system-admin bypass; required so no call site can forget it. */
  actor: Actor;
  /** Home-channel narrowing from the request; when neither field is given the read aggregates over the readable scope. */
  requested?: { homeChannelId?: string; homeChannelIds?: string[] };
  /** Channel-qualified subtree-grant keys, compiled from the hierarchy. @see shared/config/hierarchy-config.ts */
  elevatedGrants?: ReadonlySet<string>;
  /** Entity-type public read grants. @see shared/src/permissions/public-read.ts */
  publicGrants?: PublicReadGrants;
  /** Hierarchy override, as `getAllDecisions(…, { hierarchy })` takes; parity tests pass a synthetic deep chain. */
  hierarchy?: EntityHierarchy;
}

/**
 * Scope filter for a product collection read, bound to the app's policies and public read grants.
 * @throws AppError 403 `forbidden` when a requested id is outside the caller's readable scope.
 */
export const resolveCollectionReadFilter = (
  memberships: MembershipBaseModel[],
  entityType: ProductEntityType,
  organizationId: string,
  actor: Actor,
  requested?: { homeChannelId?: string; homeChannelIds?: string[] },
): CollectionReadFilter =>
  resolveCollectionReadFilterForPolicies({
    policies: policyMatrix,
    memberships,
    entityType,
    organizationId,
    actor,
    requested,
    elevatedGrants: appHierarchy.elevatedGrants,
    publicGrants: configuredPublicReadGrants,
  });

/** {@link resolveCollectionReadFilter} against an explicit policy set, for the check/SQL parity test. */
export const resolveCollectionReadFilterForPolicies = ({
  policies,
  memberships,
  entityType,
  organizationId,
  actor,
  requested,
  elevatedGrants,
  publicGrants,
  hierarchy,
}: CollectionReadScopeInput): CollectionReadFilter => {
  // Administrator short-circuit, matching the engine: they may pass the guard without a membership.
  if (!('anonymous' in actor) && actor.isSystemAdmin) {
    // A requested home channel still narrows: sysadmin widens WHO can read, never WHAT a filtered list returns.
    if (requested?.homeChannelId !== undefined)
      return { homeChannelIds: [requested.homeChannelId], conditionalScopes: [] };
    if (requested?.homeChannelIds !== undefined)
      return { homeChannelIds: requested.homeChannelIds, conditionalScopes: [] };
    return { homeChannelIds: undefined, conditionalScopes: [] };
  }

  const resolvedHierarchy = hierarchy ?? appHierarchy;
  const orderedChannels = resolvedHierarchy.getOrderedAncestors(entityType) as ChannelEntityType[];
  const acc = resolveScopes(
    policies,
    memberships,
    entityType,
    organizationId,
    elevatedGrants,
    orderedChannels,
    publicGrants,
  );
  const conditionalScopes = toConditionalScopes(acc, orderedChannels);
  const rootChannel = orderedChannels.at(-1) ?? null;
  const homeChannel = orderedChannels.find((channel) => channel !== rootChannel) ?? null;
  const intermediateScopes = toIntermediateScopes(acc);
  const homeScopes = toHomeScopes(acc, orderedChannels);

  const withScopes = (
    filter: Omit<CollectionReadFilter, 'intermediateScopes' | 'homeScopes'>,
    intermediates: IntermediateScope[] = intermediateScopes,
    homes: HomeScope[] = homeScopes,
  ): CollectionReadFilter => {
    let base: CollectionReadFilter =
      intermediates.length > 0 ? { ...filter, intermediateScopes: intermediates } : filter;
    if (homes.length > 0) base = { ...base, homeScopes: homes };
    return base;
  };

  const unconditionallyReadable = (id: string): boolean => acc.unconditionalOrgWide || acc.unconditionalIds.has(id);
  const isIntermediate = (channelType: ChannelEntityType | undefined): boolean =>
    channelType !== undefined && channelType !== homeChannel && channelType !== rootChannel;

  // Restrict requested ids only at home level; intermediate grants could otherwise widen the set.
  const conditionalScopesFor = (ids: string[]): ConditionalScope[] => {
    const remaining = ids.filter((id) => !unconditionallyReadable(id));
    if (remaining.length === 0) return [];
    return conditionalScopes
      .filter((scope) => !isIntermediate(scope.channelType) && !scope.deeperChannels)
      .map(({ condition, channelIds }) => ({
        condition,
        channelIds: channelIds === undefined ? remaining : remaining.filter((id) => channelIds.includes(id)),
      }))
      .filter((scope) => scope.channelIds.length > 0);
  };

  // Explicit single id (e.g. ?projectId=…): must be within the caller's readable scope.
  if (requested?.homeChannelId !== undefined) {
    const id = requested.homeChannelId;
    if (unconditionallyReadable(id)) return { homeChannelIds: [id], conditionalScopes: [] };

    const scopes = conditionalScopesFor([id]);
    if (scopes.length === 0) {
      throw new AppError(403, 'forbidden', 'warn', { entityType });
    }
    return { homeChannelIds: [], conditionalScopes: scopes };
  }

  // Explicit set (e.g. all projects of a workspace): intersect with the caller's scope.
  if (requested?.homeChannelIds !== undefined) {
    const unconditional = requested.homeChannelIds.filter((id) => unconditionallyReadable(id));
    return { homeChannelIds: unconditional, conditionalScopes: conditionalScopesFor(requested.homeChannelIds) };
  }

  // Aggregate read: org-wide for root-level grants, else the readable home channels plus intermediate / home scopes.
  return withScopes({
    homeChannelIds: acc.unconditionalOrgWide ? undefined : [...acc.unconditionalIds],
    conditionalScopes,
  });
};
