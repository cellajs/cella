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

/**
 * Answerability of a catchup view prefix for one product entity type.
 *
 * - `ok`: the caller has UNCONDITIONAL read of every row at or below the prefix node —
 *   per-node summaries (`f:{type}`, `e:{type}`) may be returned; they describe exactly
 *   rows the caller could read anyway.
 * - `opaque`: the caller can read SOME rows under the prefix (conditional slices like
 *   `read:'own'`/public, home-only grants, or grants on descendant channels) but not all —
 *   summaries are shared totals over rows they cannot see and would leak change-timing,
 *   so the server answers WITHOUT numbers; the client falls back to normal staleness.
 * - `forbidden`: no read route at all — indistinguishable from a nonexistent prefix.
 *
 * Deliberately conservative: `opaque` is returned whenever the caller has ANY read scope
 * in the organization that does not provably cover the node. Opaque discloses nothing,
 * so over-classifying toward it is safe; only `ok` requires proof.
 */
export type ViewReadStatus = 'ok' | 'opaque' | 'forbidden';

/**
 * Resolve whether per-node summaries for `prefix` may be shown to the caller for
 * `entityType`. Built on the SAME scope resolution as collection reads
 * (`resolveCollectionReadFilter`), so catchup answerability mirrors list reads —
 * the four-way parity suite (SQL ≍ engine ≍ dispatch ≍ prefix-catchup) pins this.
 */
/** View depth: `subtree` covers rows at or below the node; `self` only rows HOMED at it. */
export type ViewDepth = 'self' | 'subtree';

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

/**
 * Same as {@link resolveViewReadStatus} against an explicit policy set / topology,
 * mirroring `resolveCollectionReadFilterForPolicies`. Lets parity tests exercise deep
 * synthetic hierarchies that cella's own 2-level config structurally cannot reach.
 */
export function resolveViewReadStatusForPolicies(
  input: CollectionReadScopeInput,
  prefix: string,
  depth: ViewDepth = 'subtree',
  truePath?: string | null,
): ViewReadStatus {
  return classifyPrefix(prefix, input.organizationId, resolveCollectionReadFilterForPolicies(input), depth, truePath);
}

/**
 * Ancestry comes from the id, never the claim: `truePath` is the node's CDC-maintained
 * canonical path (`channel_counters.path`). When present, the claimed prefix must equal
 * it (a mismatch — forged, or stale after a reparent — answers `opaque` and self-heals
 * on re-declare, never `forbidden`: anti-oracle), and grants are matched against the
 * TRUE ancestor segments, so a subtree grant at any real ancestor proves the node.
 * Without it (channel never had activity, or pre-backfill), proof falls back to the
 * node id alone — conservative, never wider.
 */
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

  // Claimed prefix must match the verified path exactly when we have one — BEFORE the
  // org-wide shortcut: equality also proves the node really lives in this org (a forged
  // claim could otherwise address another org's node under an org-wide reader).
  if (truePath != null && truePath !== prefix) return hasNoReadScope(filter) ? 'forbidden' : 'opaque';

  // Org-wide unconditional read (org admin, sysadmin): every node in the org is answerable.
  if (filter.subChannelIds === undefined) return 'ok';

  const node = segments[segments.length - 1];
  const isOrgPrefix = segments.length === 1;
  // Verified: every segment is a real ancestor; unverified: only the node id is trusted.
  const provableIds = truePath != null ? segments : [node];

  if (!isOrgPrefix) {
    // Home-level unconditional grant (deepest level: covers its subtree).
    if (provableIds.some((id) => filter.subChannelIds?.includes(id))) return 'ok';
    // Unconditional grant at an intermediate ancestor level (subtree-scoped: elevated).
    if (filter.ancestorScopes?.some((scope) => provableIds.some((id) => scope.subChannelIds.includes(id)))) return 'ok';
  }

  // SELF views (rows homed at the node) accept a HOME-scoped unconditional grant ON THE
  // NODE only — ancestor home-grants cover their own wall, never deeper ones. Self
  // summaries (fs:/es:) describe only homed rows, so nothing beyond the caller's
  // readable set is disclosed. Subtree views can never accept this proof.
  if (depth === 'self' && filter.homeScopes?.some((scope) => scope.subChannelIds.includes(node))) return 'ok';

  // Anything else with SOME read scope → opaque; nothing at all → forbidden.
  return hasNoReadScope(filter) ? 'forbidden' : 'opaque';
}
