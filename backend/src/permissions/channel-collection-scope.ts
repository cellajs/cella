import { type AnyColumn, and, eq, inArray, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import {
  hierarchy as appHierarchy,
  type ChannelEntityType,
  type ChannelIdColumns,
  type EntityHierarchy,
  entityIdColumnKey,
  getEntityPolicies,
  getPolicyPermissions,
  type PolicyMatrix,
  type PredicateActor,
  policyMatrix,
} from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { CollectionReadWhere } from '#/permissions/row-predicates';

/** What the scope reads of a grant: a membership row and a service account's binding both carry it. */
export type ChannelScopeGrant = Pick<MembershipBaseModel, 'organizationId' | 'channelType' | 'channelId' | 'role'>;

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
  memberships: ChannelScopeGrant[];
  channelType: Exclude<ChannelEntityType, 'organization'>;
  organizationId: string;
  /** Who is asking. Carries the system-admin bypass; required so no call site can forget it. */
  actor: PredicateActor;
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

  const policies = getEntityPolicies(allPolicies, channelType);
  const ancestors = hierarchy.getOrderedAncestors(channelType) as ChannelEntityType[];

  let orgWide: ChannelCollectionReadScope['orgWide'] = null;
  const byLevel = new Map<ChannelEntityType, { managedIds: Set<string>; publishedIds: Set<string> }>();

  for (const membership of memberships) {
    if (membership.organizationId !== organizationId) continue;
    if (!ancestors.includes(membership.channelType as ChannelEntityType)) continue;

    const grantLevel = membership.channelType as ChannelEntityType;
    const isOrganization = grantLevel === 'organization';
    if (isOrganization && membership.channelId !== organizationId) continue;

    const permissions = getPolicyPermissions(policies, grantLevel, membership.role);
    if (permissions?.read !== 1) continue;
    const managed = permissions.update === 1;

    if (isOrganization) {
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
 * @public
 */
export const resolveChannelCollectionReadScope = (
  memberships: ChannelScopeGrant[],
  channelType: Exclude<ChannelEntityType, 'organization'>,
  organizationId: string,
  actor: PredicateActor,
): ChannelCollectionReadScope =>
  resolveChannelCollectionReadScopeForPolicies({ policies: policyMatrix, memberships, channelType, organizationId, actor });

/** A channel row as the draft rule reads it: its publish date and the ancestor ids it carries. */
export type DraftChannelRow = { id: string; publishedAt: string | null } & Partial<ChannelIdColumns>;

export interface DraftChannelInput extends Omit<ChannelCollectionScopeInput, 'channelType' | 'organizationId'> {
  channelType: ChannelEntityType;
  channel: DraftChannelRow;
}

/** {@link draftChannelVisibleTo} against explicit policies/hierarchy; handlers use the bound wrapper. */
export const draftChannelVisibleToForPolicies = ({ channelType, channel, memberships, actor, ...scopeInput }: DraftChannelInput): boolean => {
  if (channel.publishedAt !== null) return true;
  if (!('anonymous' in actor) && actor.isSystemAdmin) return true;
  if (memberships.some((membership) => membership.channelType === channelType && membership.channelId === channel.id)) return true;
  // Nothing sits above the organization, so its draft shows to its own members alone.
  if (channelType === 'organization' || !channel.organizationId) return false;

  const { organizationId } = channel;
  const scope = resolveChannelCollectionReadScopeForPolicies({ ...scopeInput, memberships, channelType, organizationId, actor });
  if (scope.orgWide === 'all') return true;

  return scope.ancestorScopes.some(({ channelType: level, managedIds }) => {
    const ancestorId = (channel as Record<string, unknown>)[entityIdColumnKey(level)];
    return typeof ancestorId === 'string' && managedIds.includes(ancestorId);
  });
};

/**
 * Whether a channel shows to the caller as far as its draft state goes: the rule {@link buildChannelListReadWhere}
 * compiles for a list, read for one row, so a read by id answers for the drafts a list returns and for no other. A
 * published channel shows. A draft shows to a member of the channel itself and to a caller whose grant on the
 * organization or on a channel above also holds `update` on the type. The engine's read check stays the caller's.
 * @param channelType - The type of the channel row.
 * @param channel - The row, with its publish date and ancestor ids.
 * @param memberships - The caller's grants: `ctx.var.actor.bindings`.
 * @param actor - Who is asking; carries the system-admin bypass.
 */
export const draftChannelVisibleTo = (
  channelType: ChannelEntityType,
  channel: DraftChannelRow,
  memberships: ChannelScopeGrant[],
  actor: PredicateActor,
): boolean => draftChannelVisibleToForPolicies({ policies: policyMatrix, channelType, channel, memberships, actor });

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
 * own membership rows are always in scope.
 *
 * Consumer contract, as `backend/tests/channel-discovery.test.ts` wires it:
 * - LEFT JOIN the memberships on the caller's own key alone (channel, type, user). A filter on the membership, such
 *   as a role, makes it a list of memberships: skip the scope and INNER JOIN.
 * - AND the predicate with the organization the scope was resolved for: its membership and published branches name
 *   no organization.
 * - `excludeArchived` goes in WHERE through {@link excludeArchivedWhere}; in ON it would turn an archived channel
 *   into a discovery row.
 * - Map the nested membership only when its id is non-NULL, and expect membership-sourced sort columns NULL for
 *   discovery rows (ASC puts NULLs last, members first).
 */
export const buildChannelListReadWhere = (scope: ChannelCollectionReadScope, columns: ChannelListReadColumns): CollectionReadWhere => {
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
