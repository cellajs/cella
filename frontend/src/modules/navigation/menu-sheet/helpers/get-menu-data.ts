// biome-ignore lint/style/noRestrictedImports: imperative cache prefetch helper for the router loader path; not eligible for a hook.
import { getMyMemberships } from 'sdk';
import { appConfig } from 'shared';
import { channelEntityListQueriesByType } from '~/list-queries-config';
import { meKeys } from '~/modules/me/query';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { buildMenuFromCache } from './build-menu-from-cache';

/**
 * Ensures entity data is in the cache and returns the user menu. Fetches memberships first so the
 * cache subscriber (initChannelEntityEnrichment) can enrich entity lists, then delegates to
 * buildMenuFromCache.
 */
export async function getMenuData() {
  const userId = useUserStore.getState().user.id;

  // Fetch memberships first; the subscriber reads from this cache.
  await queryClient.ensureQueryData({
    queryKey: meKeys.memberships,
    queryFn: async ({ signal }) => getMyMemberships({ signal }),
    revalidateIfStale: true,
    staleTime: 0,
  });

  // Fetch entity lists; the subscriber enriches them with memberships on cache write.
  await Promise.all(
    appConfig.channelEntityTypes.map(async (entityType) => {
      const factory = channelEntityListQueriesByType[entityType];
      if (!factory) return;
      const queryOpts = factory({ relatableUserId: userId });
      // biome-ignore lint/suspicious/noExplicitAny: heterogeneous infinite query options across entity types.
      await queryClient.ensureInfiniteQueryData({ ...queryOpts, revalidateIfStale: true } as any);
    }),
  );

  return buildMenuFromCache(userId);
}
