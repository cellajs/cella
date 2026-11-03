import {
  type Access,
  accessScopes,
  hierarchy as appHierarchy,
  type ChannelEntityType,
  publicReadGrants as configuredPublicReadGrants,
  type EntityHierarchy,
  getEntityPolicies,
  getPolicyPermissions,
  isRowCondition,
  type PolicyMatrix,
  type ProductEntityType,
  type PublicReadGrants,
  policyMatrix,
  type RowConditionName,
} from 'shared';
import type { ActorBinding } from '#/core/context';
import { AppError } from '#/core/error';

/**
 * One readable slice of a product collection: the rows whose `channelType` id column is in `channelIds`. A `condition`
 * bounds them to the rows it matches; `deeperChannels`, set for a grant of a role the hierarchy does not elevate,
 * requires the columns of the levels below `channelType` to be NULL, so only rows homed at the grant's level match.
 */
export interface ReadScope {
  channelType: ChannelEntityType;
  channelIds: string[];
  condition?: RowConditionName;
  deeperChannels?: ChannelEntityType[];
}

/** Effective collection-read scopes, OR-combined; `orgWide` reads every row of the organization and holds no scopes. */
export interface CollectionReadFilter {
  orgWide: boolean;
  scopes: ReadScope[];
}

/** The rules a read scope resolves under, each the app's unless a test passes a synthetic one. */
export interface ReadRules {
  policies?: PolicyMatrix;
  /** Entity-type public read grants. @see shared/src/permissions/public-read.ts */
  publicGrants?: PublicReadGrants;
  /** Elevation is read off it (`elevatedGrants`). @see shared/config/hierarchy-config.ts */
  hierarchy?: EntityHierarchy;
}

/** Whether the resolved filter yields no readable rows at all (op should return an empty list). */
export const hasNoReadScope = (filter: CollectionReadFilter): boolean => !filter.orgWide && filter.scopes.length === 0;

/**
 * The scopes the caller's grants in one organization add up to. A grant at the product's parent or above it by an
 * elevated role reads its channel's whole subtree, at the organization the whole organization; any other grant reads
 * the rows homed at its channel. A row-condition cell (`read: 'own'`) contributes a conditional scope, so the role can
 * still list, and public read joins as an organization-wide `'public'` scope.
 * @param ancestors - Most specific first, ending at the organization: `[project, course, organization]`.
 */
const resolveScopes = (
  policies: PolicyMatrix,
  memberships: ActorBinding[],
  entityType: ProductEntityType,
  organizationId: string,
  elevatedGrants: ReadonlySet<string>,
  ancestors: readonly ChannelEntityType[],
  publicGrants: PublicReadGrants,
): CollectionReadFilter => {
  const entityPolicies = getEntityPolicies(policies, entityType);
  // Scopes of one level, condition and home scoping share an entry, so a member of many channels compiles one IN list.
  const byKey = new Map<string, ReadScope>();
  const add = (channelType: ChannelEntityType, channelId: string, condition?: RowConditionName, homeOnly = false) => {
    const key = `${channelType}:${condition ?? ''}:${homeOnly}`;
    const deeperChannels = homeOnly ? ancestors.slice(0, ancestors.indexOf(channelType)) : [];
    const scope = byKey.get(key) ?? {
      channelType,
      channelIds: [],
      ...(condition && { condition }),
      ...(deeperChannels.length > 0 && { deeperChannels }),
    };
    if (!scope.channelIds.includes(channelId)) scope.channelIds.push(channelId);
    byKey.set(key, scope);
  };

  for (const membership of memberships) {
    const level = membership.channelType;
    // A grant elsewhere than this organization, or on a channel the product does not live under, reads nothing here.
    const inOrganization =
      level === 'organization'
        ? membership.channelId === organizationId
        : membership.organizationId === organizationId && !!membership.channelId && ancestors.includes(level);
    if (!inOrganization) continue;

    const read = getPolicyPermissions(entityPolicies, level, membership.role)?.read ?? 0;
    const homeOnly = level !== ancestors[0] && !elevatedGrants.has(`${level}:${membership.role}`);
    if (read === 1 && level === 'organization' && !homeOnly) return { orgWide: true, scopes: [] };
    if (read === 1) add(level, membership.channelId, undefined, homeOnly);
    else if (isRowCondition(read)) add(level, membership.channelId, read, homeOnly);
  }

  if (publicGrants[entityType]) add('organization', organizationId, 'public');

  return { orgWide: false, scopes: [...byKey.values()] };
};

/**
 * Scope filter for a product collection read: what the caller's bindings let it read in one organization.
 * @param requested - Home-channel narrowing from the request; without it the read aggregates over the readable scope.
 * @throws AppError 404 `not_found` when a requested home channel is outside the caller's readable scope.
 */
export const resolveCollectionReadFilter = (
  access: Access<ActorBinding>,
  entityType: ProductEntityType,
  organizationId: string,
  requested?: { homeChannelId?: string; homeChannelIds?: string[] },
  { policies = policyMatrix, publicGrants = configuredPublicReadGrants, hierarchy = appHierarchy }: ReadRules = {},
): CollectionReadFilter => {
  const ancestors = hierarchy.getOrderedAncestors(entityType) as ChannelEntityType[];
  // The product's parent: where a requested home channel and the narrowed scopes compare.
  const homeLevel = ancestors[0] ?? 'organization';
  const atHome = (channelIds: string[], condition?: RowConditionName): ReadScope[] =>
    channelIds.length === 0 ? [] : [{ channelType: homeLevel, channelIds, ...(condition && { condition }) }];

  // A scoped API key or token that lacks the `<type>:read` access scope reads nothing, sysadmin or not.
  if (!('anonymous' in access) && !accessScopes.allows(access.scopes, entityType, 'read')) return { orgWide: false, scopes: [] };

  // Administrator short-circuit, matching the engine: they may pass the guard without a membership.
  if (!('anonymous' in access) && access.isSystemAdmin) {
    // A requested home channel still narrows: sysadmin widens WHO can read, never WHAT a filtered list returns.
    if (requested?.homeChannelId !== undefined) return { orgWide: false, scopes: atHome([requested.homeChannelId]) };
    if (requested?.homeChannelIds !== undefined) return { orgWide: false, scopes: atHome(requested.homeChannelIds) };
    return { orgWide: true, scopes: [] };
  }

  const memberships = 'anonymous' in access ? [] : access.memberships;
  const filter = resolveScopes(policies, memberships, entityType, organizationId, hierarchy.elevatedGrants, ancestors, publicGrants);
  if (!requested || (requested.homeChannelId === undefined && requested.homeChannelIds === undefined)) return filter;

  const homeGranted = filter.scopes.filter((scope) => scope.channelType === homeLevel && !scope.condition && !scope.deeperChannels);
  const readable = (id: string): boolean => filter.orgWide || homeGranted.some((scope) => scope.channelIds.includes(id));

  // Requested ids narrow only home-level and organization-wide conditions; an intermediate or home-scoped grant could
  // otherwise widen the set.
  const conditionalAt = (ids: string[]): ReadScope[] =>
    filter.scopes.flatMap(({ channelType, channelIds, condition, deeperChannels }) => {
      if (!condition || deeperChannels) return [];
      if (channelType === 'organization') return atHome(ids, condition);
      if (channelType === homeLevel)
        return atHome(
          ids.filter((id) => channelIds.includes(id)),
          condition,
        );
      return [];
    });

  // Explicit single id (e.g. ?projectId=…): must be within the caller's readable scope, else the channel reads as
  // missing, as any channel the caller may not read does.
  if (requested.homeChannelId !== undefined) {
    const id = requested.homeChannelId;
    if (readable(id)) return { orgWide: false, scopes: atHome([id]) };

    const scopes = conditionalAt([id]);
    if (scopes.length === 0) {
      throw new AppError(404, 'not_found', 'warn', { entityType: homeLevel === 'organization' ? entityType : homeLevel });
    }
    return { orgWide: false, scopes };
  }

  // Explicit set (e.g. all projects of a workspace): intersect with the caller's scope.
  const ids = requested.homeChannelIds ?? [];
  return { orgWide: false, scopes: [...atHome(ids.filter(readable)), ...conditionalAt(ids)] };
};
