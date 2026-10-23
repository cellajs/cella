import type { DefaultError, FetchQueryOptions, QueryKey } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import { redirectOnMissing } from '~/utils/redirect-on-missing';
import { rewriteUrlToSlug } from '~/utils/rewrite-url-to-slug';

type ResolveChannelBySlugConfig<T extends { id: string; slug: string }, TParams extends Record<string, string>, TQueryKey extends QueryKey> = {
  /** Route param value, either the entity's id or its slug. */
  idOrSlug: string;
  tenantId: string;
  /** Looks up a cached entity by id or slug (list cache), scoped to tenant. */
  findInCache: (idOrSlug: string, tenantId: string) => T | undefined;
  /** Detail query options for the entity, keyed by id. */
  detailQueryOptions: (id: string) => FetchQueryOptions<T, DefaultError, T, TQueryKey>;
  /** Fetches the entity by slug when it isn't resolvable from cache. */
  fetchBySlug: () => Promise<T>;
  /** Default true: skip the id-based read while offline, resolving to undefined. False always reads and waits for reconnection. */
  readRequiresOnline?: boolean;
  /** Revalidate a stale cached entry in the background, for fresh navigations. An entry this call seeds revalidates always. */
  revalidateIfStale?: boolean;
  params: TParams;
  /** Builds the slug-based param overrides for `rewriteUrlToSlug` once the entity resolves. */
  buildSlugOverrides: (entity: T) => Partial<Record<keyof TParams, string>>;
};

/** Resolves an id-or-slug route param from the list cache, the detail cache it seeds, or a slug fetch; redirects to /home when nothing resolves, else rewrites the URL to the slug. */
export async function resolveChannelBySlug<
  T extends { id: string; slug: string },
  TParams extends Record<string, string>,
  TQueryKey extends QueryKey,
>(config: ResolveChannelBySlugConfig<T, TParams, TQueryKey>): Promise<T> {
  const {
    idOrSlug,
    tenantId,
    findInCache,
    detailQueryOptions,
    fetchBySlug,
    readRequiresOnline = true,
    revalidateIfStale,
    params,
    buildSlugOverrides,
  } = config;

  const isOnline = onlineManager.isOnline();

  const cached = findInCache(idOrSlug, tenantId);

  let entity: T | undefined;

  if (cached) {
    const options = detailQueryOptions(cached.id);

    // The list row seeds the detail so the cache-first read below returns at once. A list row is no detail (no counts), so
    // the seed is stamped never fetched and revalidated below whatever the navigation: observers do not refetch on mount.
    const seeded = !queryClient.getQueryData<T>(options.queryKey);
    if (seeded) queryClient.setQueryData<T>(options.queryKey, cached, { updatedAt: 0 });

    // `staleTime: 'static'` returns a cached entry at once whatever its age; the plain read refetches a stale one behind the
    // resolved navigation, online only, so an offline entry never leaves the detail query in an error state.
    if (readRequiresOnline && !isOnline) {
      entity = queryClient.getQueryData<T>(options.queryKey);
    } else {
      const read = await queryClient.query({ ...options, staleTime: 'static' });
      // The list row that matched the URL and the detail name two slugs: one is behind a rename, and a rewrite to the older
      // slug points at a slug the channel gave up. The server's row decides.
      const slugsDisagree = isOnline && read.slug !== cached.slug;
      entity = slugsDisagree ? await queryClient.query({ ...options, staleTime: 0 }) : read;
      if (!slugsDisagree && (revalidateIfStale || seeded) && isOnline) void queryClient.query(options).catch(() => {});
    }
  } else if (isOnline) {
    // Fetched through the query cache for its error handling; a key per call and gcTime 0 leave no slug-keyed entry behind.
    const fetched = await queryClient.query({ queryKey: ['slug-fetch', crypto.randomUUID()], queryFn: fetchBySlug, gcTime: 0 });
    queryClient.setQueryData<T>(detailQueryOptions(fetched.id).queryKey, fetched);
    entity = fetched;
  }

  redirectOnMissing(entity);

  rewriteUrlToSlug(params, buildSlugOverrides(entity));

  return entity;
}
