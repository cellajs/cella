import { hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';

/**
 * Is a sub-org channel on screen? A channel counts as viewed while a mounted view observes a list
 * query carrying its id. The sync tier (`isViewingScope` in `sync-priority.ts`) used to infer this
 * from the router, which only sees channels the route itself names — a board rendering one panel
 * per project has N channels on screen while the route names only their parent, and slug routes
 * (`rewriteUrlToSlug`) never carry the id the scan looked for. Query keys have neither problem:
 * they are built from loaded entities (ids, never slugs), and every surface that renders a
 * channel's data observes a query for it — so observation IS the viewing signal, with no per-view
 * wiring for forks.
 *
 * Same value-scan trick the route-param check used, pointed at the right collection: scan for the
 * NOTIFIED channel id, so no key classification (and no config) is needed. Channel ids reach list
 * keys via the `createEntityKeys` contract — scope-key segments or filter values — which
 * `registerEntityQueryKeys` enforces for hand-rolled keys. An on-demand scan over active queries,
 * like the membership check next to it in `getSyncTier`: notifications are low-frequency and the
 * active set is small, so per-call reads beat maintaining an index.
 *
 * Prefetches create no observers (`type: 'active'`), so route-level `ensureQueryData` of sibling
 * channels does not mark them viewed; unmounting removes the observer, so the answer self-corrects
 * with no cleanup to forget.
 */
export function isObservedChannel(channelId: string): boolean {
  return queryClient
    .getQueryCache()
    .findAll({ type: 'active' })
    .some((query) => {
      const [entityType, kind] = query.queryKey;
      if (typeof entityType !== 'string' || kind !== 'list' || !hasEntityQueryKeys(entityType)) return false;
      return keyCarriesChannelId(query.queryKey, channelId);
    });
}

/** True when any segment past [entity, 'list'] is the id itself (scope key) or a filter object holding it. */
function keyCarriesChannelId(queryKey: readonly unknown[], channelId: string): boolean {
  for (let i = 2; i < queryKey.length; i++) {
    const segment = queryKey[i];
    if (segment === channelId) return true;
    if (segment && typeof segment === 'object' && Object.values(segment).includes(channelId)) return true;
  }
  return false;
}
