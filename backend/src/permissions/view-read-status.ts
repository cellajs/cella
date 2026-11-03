import type { Access, ProductEntityType } from 'shared';
import { pathSegments } from 'shared';
import type { ActorBinding } from '#/core/context';
import { type CollectionReadFilter, hasNoReadScope, type ReadRules, resolveCollectionReadFilter } from '#/permissions/collection-scope';

/** Catchup prefix disclosure: `ok` proves full read coverage, `opaque` allows rows but no totals, `forbidden` no route; ambiguity resolves opaque. */
export type ViewReadStatus = 'ok' | 'opaque' | 'forbidden';

/** View depth: `subtree` covers rows at or below the node; `self` only rows HOMED at it. */
export type ViewDepth = 'self' | 'subtree';

/** Whether per-node summaries for `prefix` may be shown, on the SAME scope resolution as collection reads (pinned by the parity suite). */
export function resolveViewReadStatus(
  access: Access<ActorBinding>,
  entityType: ProductEntityType,
  organizationId: string,
  prefix: string,
  depth: ViewDepth = 'subtree',
  truePath?: string | null,
  rules?: ReadRules,
): ViewReadStatus {
  const filter = resolveCollectionReadFilter(access, entityType, organizationId, undefined, rules);
  return classifyPrefix(prefix, organizationId, filter, depth, truePath);
}

/**
 * Verifies claimed ancestry against the CDC-maintained canonical path: a mismatch returns opaque (no existence
 * oracle), a missing path proves only the node id and never that a deeper node lives in the organization.
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

  // Claimed prefix must match the verified path exactly when we have one, BEFORE the org-wide
  // shortcut: equality also proves the node lives in this org, blocking a forged cross-org claim.
  if (truePath != null && truePath !== prefix) return hasNoReadScope(filter) ? 'forbidden' : 'opaque';

  const node = segments[segments.length - 1];
  const isOrgPrefix = segments.length === 1;

  // Org-wide unconditional read (org admin, sysadmin): every node proven to be in the org is answerable. The org
  // prefix proves itself; a deeper node needs its verified path, since without one its first segment is only a claim.
  if (filter.orgWide) return isOrgPrefix || truePath != null ? 'ok' : 'opaque';

  // Verified: every segment is a real ancestor; unverified: only the node id is trusted.
  const provableIds = truePath != null ? segments : [node];
  const unconditional = filter.scopes.filter((scope) => !scope.condition);

  // An unconditional grant that reaches its subtree, at the home level or an elevated one above it, covers the node.
  const subtreeGrant = unconditional.some((scope) => !scope.deeperChannels && provableIds.some((id) => scope.channelIds.includes(id)));
  if (!isOrgPrefix && subtreeGrant) return 'ok';

  // A self view accepts only an unconditional home grant on that exact node: ancestor home grants do not prove descendants.
  if (depth === 'self' && unconditional.some((scope) => scope.deeperChannels && scope.channelIds.includes(node))) return 'ok';

  // Anything else with SOME read scope → opaque; nothing at all → forbidden.
  return hasNoReadScope(filter) ? 'forbidden' : 'opaque';
}
