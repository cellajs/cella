import type { DefaultError, FetchQueryOptions, QueryKey } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { fetchSlugCacheId } from '~/query/basic/fetch-slug-cache-id';
import { queryClient } from '~/query/query-client';
import { redirectOnMissing } from '~/utils/redirect-on-missing';
import { rewriteUrlToSlug } from '~/utils/rewrite-url-to-slug';

type ResolveChannelBySlugConfig<
  T extends { id: string; slug: string },
  P extends Record<string, string>,
  TQueryKey extends QueryKey,
> = {
  /** Route param value, either the entity's id or its slug. */
  idOrSlug: string;
  tenantId: string;
  /** Looks up a cached entity by id or slug (list cache), scoped to tenant. */
  findInCache: (idOrSlug: string, tenantId: string) => T | undefined;
  /** Detail query options for the entity, keyed by id. */
  detailQueryOptions: (id: string) => FetchQueryOptions<T, DefaultError, T, TQueryKey>;
  /** Fetches the entity by slug when it isn't resolvable from cache. */
  fetchBySlug: () => Promise<T>;
  /** Cache key `fetchSlugCacheId` seeds once `fetchBySlug` resolves. */
  slugFetchCacheKey: (id: string) => readonly unknown[];
  /** Default true: skip the id-based `ensureQueryData` while offline, resolving to undefined. False always ensures and waits for reconnection. */
  ensureRequiresOnline?: boolean;
  /** Forwarded to `ensureQueryData` to force revalidation on fresh navigations. */
  revalidateIfStale?: boolean;
  params: P;
  /** Builds the slug-based param overrides for `rewriteUrlToSlug` once the entity resolves. */
  buildSlugOverrides: (entity: T) => Partial<Record<keyof P, string>>;
  routeTo: string;
};

/**
 * Resolves a channel entity from a route param that may be an id or a slug.
 * Reads the list cache, seeds and reads the detail cache, fetches by slug when no id is cached, redirects to /home when nothing resolves, and rewrites the URL to the canonical slug.
 */
export async function resolveChannelBySlug<
  T extends { id: string; slug: string },
  P extends Record<string, string>,
  TQueryKey extends QueryKey,
>(config: ResolveChannelBySlugConfig<T, P, TQueryKey>): Promise<T> {
  const {
    idOrSlug,
    tenantId,
    findInCache,
    detailQueryOptions,
    fetchBySlug,
    slugFetchCacheKey,
    ensureRequiresOnline = true,
    revalidateIfStale,
    params,
    buildSlugOverrides,
    routeTo,
  } = config;

  const isOnline = onlineManager.isOnline();

  const cached = findInCache(idOrSlug, tenantId);
  const id = cached?.id;

  let entity: T | undefined;

  if (id) {
    const options = detailQueryOptions(id);

    // Seeding the detail cache lets ensureQueryData return without blocking on a fetch.
    if (cached && !queryClient.getQueryData<T>(options.queryKey)) {
      queryClient.setQueryData<T>(options.queryKey, cached);
    }

    // ensureQueryData returns cached data without blocking and, with revalidateIfStale, prefetches a stale entry in the background.
    // Background revalidation is online-only so an offline entry never leaves the detail query in an error state.
    const shouldEnsure = ensureRequiresOnline ? isOnline : true;
    entity = shouldEnsure
      ? await queryClient.ensureQueryData({ ...options, revalidateIfStale: revalidateIfStale && isOnline })
      : queryClient.getQueryData<T>(options.queryKey);
  } else if (isOnline) {
    entity = await fetchSlugCacheId(fetchBySlug, slugFetchCacheKey);
  }

  redirectOnMissing(entity);

  rewriteUrlToSlug(params, buildSlugOverrides(entity), routeTo);

  return entity;
}
