import type { Actor, ProductEntityType } from 'shared';
import { pathSegments } from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import {
  type CollectionReadFilter,
  type CollectionReadScopeInput,
  hasNoReadScope,
  resolveCollectionReadFilter,
  resolveCollectionReadFilterForPolicies,
} from './collection-scope';

/** Catchup prefix disclosure: `ok` proves full read coverage, `opaque` allows rows but no totals, `forbidden` no route; ambiguity resolves opaque. */
export type ViewReadStatus = 'ok' | 'opaque' | 'forbidden';

/** View depth: `subtree` covers rows at or below the node; `self` only rows HOMED at it. */
export type ViewDepth = 'self' | 'subtree';

/** Whether per-node summaries for `prefix` may be shown, on the SAME scope resolution as collection reads (pinned by the parity suite). */
export function resolveViewReadStatus(
  memberships: MembershipBaseModel[],
  entityType: ProductEntityType,
  organizationId: string,
  actor: Actor,
  prefix: string,
  depth: ViewDepth = 'subtree',
  truePath?: string | null,
): ViewReadStatus {
  return classifyPrefix(
    prefix,
    organizationId,
    resolveCollectionReadFilter(memberships, entityType, organizationId, actor),
    depth,
    truePath,
  );
}

/** {@link resolveViewReadStatus} against an explicit policy set / hierarchy, for deep-hierarchy parity tests. */
export function resolveViewReadStatusForPolicies(
  input: CollectionReadScopeInput,
  prefix: string,
  depth: ViewDepth = 'subtree',
  truePath?: string | null,
): ViewReadStatus {
  return classifyPrefix(prefix, input.organizationId, resolveCollectionReadFilterForPolicies(input), depth, truePath);
}

/** Verifies claimed ancestry against the CDC-maintained canonical path: a mismatch returns opaque (no existence oracle), a missing path proves only the node id. */
function classifyPrefix(
  prefix: string,
  organizationId: string,
  filter: CollectionReadFilter,
  depth: ViewDepth,
  truePath?: string | null,
): ViewReadStatus {
  const segments = pathSegments(prefix);
  // A prefix must live inside the requested organization (paths are root-first).
  if (segments.length === 0 || segments[0] !== organizationId) return 'forbidden';

  // Claimed prefix must match the verified path exactly when we have one, BEFORE the org-wide
  // shortcut: equality also proves the node lives in this org, blocking a forged cross-org claim.
  if (truePath != null && truePath !== prefix) return hasNoReadScope(filter) ? 'forbidden' : 'opaque';

  // Org-wide unconditional read (org admin, sysadmin): every node in the org is answerable.
  if (filter.homeChannelIds === undefined) return 'ok';

  const node = segments[segments.length - 1];
  const isOrgPrefix = segments.length === 1;
  // Verified: every segment is a real ancestor; unverified: only the node id is trusted.
  const provableIds = truePath != null ? segments : [node];

  if (!isOrgPrefix) {
    // Home-level unconditional grant (deepest level: covers its subtree).
    if (provableIds.some((id) => filter.homeChannelIds?.includes(id))) return 'ok';
    // Unconditional grant at an intermediate ancestor level (subtree-scoped: elevated).
    if (filter.intermediateScopes?.some((scope) => provableIds.some((id) => scope.channelIds.includes(id))))
      return 'ok';
  }

  // A self view accepts only an unconditional home grant on that exact node: ancestor home grants do not prove descendants.
  if (depth === 'self' && filter.homeScopes?.some((scope) => scope.channelIds.includes(node))) return 'ok';

  // Anything else with SOME read scope → opaque; nothing at all → forbidden.
  return hasNoReadScope(filter) ? 'forbidden' : 'opaque';
}
