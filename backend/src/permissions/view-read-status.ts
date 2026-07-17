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
 *   per-node summaries (`hw:{type}`, `e:{type}`) may be returned; they describe exactly
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
export function resolveViewReadStatus(
  memberships: MembershipBaseModel[],
  entityType: ProductEntityType,
  organizationId: string,
  actor: Actor,
  prefix: string,
): ViewReadStatus {
  return classifyPrefix(
    prefix,
    organizationId,
    resolveCollectionReadFilter(memberships, entityType, organizationId, actor),
  );
}

/**
 * Same as {@link resolveViewReadStatus} against an explicit policy set / topology,
 * mirroring `resolveCollectionReadFilterForPolicies`. Lets parity tests exercise deep
 * synthetic hierarchies that cella's own 2-level config structurally cannot reach.
 */
export function resolveViewReadStatusForPolicies(input: CollectionReadScopeInput, prefix: string): ViewReadStatus {
  return classifyPrefix(prefix, input.organizationId, resolveCollectionReadFilterForPolicies(input));
}

function classifyPrefix(prefix: string, organizationId: string, filter: CollectionReadFilter): ViewReadStatus {
  const segments = pathSegments(prefix);
  // A prefix must live inside the requested organization (paths are root-first).
  if (segments.length === 0 || segments[0] !== organizationId) return 'forbidden';

  // Org-wide unconditional read (org admin, sysadmin): every node in the org is answerable.
  if (filter.subChannelIds === undefined) return 'ok';

  const node = segments[segments.length - 1];
  const isOrgPrefix = segments.length === 1;

  if (!isOrgPrefix) {
    // Grants are honored on the prefix's DEEPEST node id only. Prefixes are client-supplied
    // strings: matching a grant against an intermediate SEGMENT (e.g. "the course id appears
    // in the path, so the project below must be covered") would let a forged prefix attach an
    // unrelated node under a granted ancestor and read its summaries. Node ids are safe —
    // both grants and channel_counters rows key on the real channel id. A caller with an
    // ancestor grant asking about a deeper node gets `opaque` (correct, just conservative);
    // verifying claimed ancestry against the channel's stored `path` is a possible upgrade.
    if (filter.subChannelIds.includes(node)) return 'ok';
    // Unconditional grant at an intermediate ancestor level held ON the node itself
    // (e.g. a course-level grant answering the course's own prefix).
    if (filter.ancestorScopes?.some((scope) => scope.subChannelIds.includes(node))) return 'ok';
  }

  // Anything else with SOME read scope → opaque; nothing at all → forbidden.
  // (Home-only grants cover rows homed exactly at their level, not the subtree, and
  // conditional slices cover per-row subsets — neither proves the node.)
  return hasNoReadScope(filter) ? 'forbidden' : 'opaque';
}
