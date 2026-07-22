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
 * Controls whether a catchup prefix may disclose summaries.
 * `ok` proves full read coverage, `opaque` permits some rows but withholds shared totals,
 * and `forbidden` exposes no route. Ambiguous readable scopes conservatively resolve opaque.
 */
export type ViewReadStatus = 'ok' | 'opaque' | 'forbidden';

/** View depth: `subtree` covers rows at or below the node; `self` only rows HOMED at it. */
export type ViewDepth = 'self' | 'subtree';

/**
 * Resolve whether per-node summaries for `prefix` may be shown to the caller for
 * `entityType`. Built on the SAME scope resolution as collection reads
 * (`resolveCollectionReadFilter`), so catchup answerability mirrors list reads.
 * The four-way parity suite (SQL ≍ engine ≍ dispatch ≍ prefix-catchup) pins this.
 */
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
 * Uses the CDC-maintained canonical path to verify claimed ancestry.
 * A mismatch returns opaque to avoid an existence oracle and self-heals after redeclaration;
 * missing canonical paths conservatively prove only the node ID.
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

  // Claimed prefix must match the verified path exactly when we have one (BEFORE the
  // org-wide shortcut): equality also proves the node really lives in this org (a forged
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

  // A self view accepts only an unconditional home grant on that exact node.
  // Ancestor home grants do not prove descendants, and subtree views cannot use this proof.
  if (depth === 'self' && filter.homeScopes?.some((scope) => scope.subChannelIds.includes(node))) return 'ok';

  // Anything else with SOME read scope → opaque; nothing at all → forbidden.
  return hasNoReadScope(filter) ? 'forbidden' : 'opaque';
}
