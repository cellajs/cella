import { type AnyColumn, and, eq, inArray, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import {
  type Actor,
  hierarchy as appHierarchy,
  type ChannelEntityType,
  type EntityHierarchy,
  getEntityPolicies,
  getPolicyPermissions,
  type PolicyMatrix,
  policyMatrix,
} from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { CollectionReadWhere } from '#/permissions/row-predicates';

// CHANNEL-entity sibling of `collection-scope.ts`, for sub-org channel types. See "Enforcement paths" in cella/PERMISSIONS.md.

/** Readable ids granted at one ancestor level, split by draft visibility. */
export interface ChannelAncestorScope {
  channelType: ChannelEntityType;
  /** Grants whose role also holds `update` on the listed type: drafts included. */
  managedIds: string[];
  /** Read-only grants: published rows only (drafts stay member/manager-visible). */
  publishedIds: string[];
}

export interface ChannelCollectionReadScope {
  /** 'all' = unconditional org-wide (drafts included); 'published' = org-wide published rows. */
  orgWide: 'all' | 'published' | null;
  ancestorScopes: ChannelAncestorScope[];
}

export interface ChannelCollectionScopeInput {
  policies: PolicyMatrix;
  memberships: MembershipBaseModel[];
  channelType: Exclude<ChannelEntityType, 'organization'>;
  organizationId: string;
  /** Who is asking. Carries the system-admin bypass; required so no call site can forget it. */
  actor: Actor;
  /** Hierarchy override; tests pass a synthetic one. */
  hierarchy?: EntityHierarchy;
}

/** {@link resolveChannelCollectionReadScope} against explicit policies/hierarchy; handlers use the bound wrapper. */
export const resolveChannelCollectionReadScopeForPolicies = ({
  policies: allPolicies,
  memberships,
  channelType,
  organizationId,
  actor,
  hierarchy = appHierarchy as unknown as EntityHierarchy,
}: ChannelCollectionScopeInput): ChannelCollectionReadScope => {
  if (!('anonymous' in actor) && actor.isSystemAdmin) return { orgWide: 'all', ancestorScopes: [] };

  const policies = getEntityPolicies(channelType, allPolicies);
  const ancestors = hierarchy.getOrderedAncestors(channelType) as ChannelEntityType[];

  let orgWide: ChannelCollectionReadScope['orgWide'] = null;
  const byLevel = new Map<ChannelEntityType, { managedIds: Set<string>; publishedIds: Set<string> }>();

  for (const membership of memberships) {
    if (membership.organizationId !== organizationId) continue;
    if (!ancestors.includes(membership.channelType as ChannelEntityType)) continue;

    const grantLevel = membership.channelType as ChannelEntityType;
    const isRoot = grantLevel === 'organization';
    if (isRoot && membership.channelId !== organizationId) continue;

    const permissions = getPolicyPermissions(policies, grantLevel, membership.role);
    if (permissions?.read !== 1) continue;
    const managed = permissions.update === 1;

    if (isRoot) {
      if (managed) orgWide = 'all';
      else orgWide ??= 'published';
      continue;
    }

    const entry = byLevel.get(grantLevel) ?? { managedIds: new Set<string>(), publishedIds: new Set<string>() };
    if (managed) entry.managedIds.add(membership.channelId);
    else entry.publishedIds.add(membership.channelId);
    byLevel.set(grantLevel, entry);
  }

  if (orgWide === 'all') return { orgWide, ancestorScopes: [] };

  const ancestorScopes: ChannelAncestorScope[] = [];
  for (const [levelType, { managedIds, publishedIds }] of byLevel) {
    ancestorScopes.push({
      channelType: levelType,
      managedIds: [...managedIds],
      // Managed ids subsume the published-only slice for the same id
      publishedIds: [...publishedIds].filter((id) => !managedIds.has(id)),
    });
  }
  return { orgWide, ancestorScopes };
};

/**
 * Which rows of `channelType` the caller can read via org-root or ancestor-level grants. Own-type
 * memberships are NOT in the result; list queries carry those through their membership join. Row
 * conditions and `publicRead` grants are never compiled here: channel matrices use plain `read: 1`.
 */
export const resolveChannelCollectionReadScope = (
  memberships: MembershipBaseModel[],
  channelType: Exclude<ChannelEntityType, 'organization'>,
  organizationId: string,
  actor: Actor,
): ChannelCollectionReadScope =>
  resolveChannelCollectionReadScopeForPolicies({
    policies: policyMatrix,
    memberships,
    channelType,
    organizationId,
    actor,
  });

/** The table columns a channel list query exposes to compile the scope into SQL. */
export interface ChannelListReadColumns {
  /** Membership-join user id column: non-NULL marks the caller's own membership rows. */
  membershipUserId: AnyColumn;
  publishedAt: AnyColumn;
  /** The listed table's denormalized ancestor id columns (e.g. courseId, workspaceId). */
  ancestorIdColumns: Partial<Record<ChannelEntityType, AnyColumn>>;
  /** Membership archived column; set to compile `excludeArchived` against the LEFT join. */
  membershipArchived?: AnyColumn;
}

/**
 * Compile a resolved channel read scope into the list query's predicate: own-membership rows ∪
 * org-wide rows ∪ ancestor-scoped rows (published-only for read-only grants). 'none' cannot occur:
 * own membership rows are always in scope. Consumer contract: keep role/archived filters in the
 * membership join ON (never WHERE), map the nested membership only when its id is non-NULL, and
 * expect membership-sourced sort columns NULL for discovery rows (ASC puts NULLs last, members first).
 */
export const buildChannelListReadWhere = (
  scope: ChannelCollectionReadScope,
  columns: ChannelListReadColumns,
): CollectionReadWhere => {
  if (scope.orgWide === 'all') return { kind: 'all' };

  const branches: SQL[] = [isNotNull(columns.membershipUserId)];
  if (scope.orgWide === 'published') branches.push(isNotNull(columns.publishedAt));

  for (const { channelType, managedIds, publishedIds } of scope.ancestorScopes) {
    const column = columns.ancestorIdColumns[channelType];
    if (!column) continue;
    if (managedIds.length > 0) branches.push(inArray(column, managedIds));
    if (publishedIds.length > 0) {
      const published = and(inArray(column, publishedIds), isNotNull(columns.publishedAt));
      if (published) branches.push(published);
    }
  }

  // Cast: `or` with a non-empty branch list always yields SQL
  return { kind: 'where', where: or(...branches) as SQL };
};

/** `excludeArchived` for the LEFT-join variant: a row the caller archived is hidden, not shown as a discovery row. */
export const excludeArchivedWhere = (columns: ChannelListReadColumns): SQL | undefined => {
  if (!columns.membershipArchived) return undefined;
  return or(isNull(columns.membershipUserId), eq(columns.membershipArchived, false));
};
