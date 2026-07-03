// biome-ignore lint/style/noRestrictedImports: imperative cache prefetch helper — used by router loader path; not eligible for a hook.
import { getMyMemberships } from 'sdk';
import { appConfig } from 'shared';
import { contextEntityListQueriesByType } from '~/list-queries-config';
import { meKeys } from '~/modules/me/query';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { buildMenuFromCache } from './build-menu-from-cache';

/**
 * Ensures entity data is in the cache and returns the user menu.
 * Fetches memberships first so the cache subscriber (initContextEntityEnrichment)
 * can enrich entity lists automatically, then delegates to buildMenuFromCache.
 *
 * @returns The menu data.
 */
export async function getMenuData() {
  const userId = useUserStore.getState().user.id;

  // Fetch memberships first — populates the cache that the subscriber reads from
  await queryClient.ensureQueryData({
    queryKey: meKeys.memberships,
    queryFn: async ({ signal }) => getMyMemberships({ signal }),
    revalidateIfStale: true,
    staleTime: 0,
  });

  // Fetch entity lists — the subscriber enriches them with memberships on cache write
  await Promise.all(
    appConfig.contextEntityTypes.map(async (entityType) => {
      const factory = contextEntityListQueriesByType[entityType];
      if (!factory) return;
      const queryOpts = factory({ relatableUserId: userId });
      // biome-ignore lint/suspicious/noExplicitAny: heterogeneous infinite query options across entity types.
      await queryClient.ensureInfiniteQueryData({ ...queryOpts, revalidateIfStale: true } as any);
    }),
  );

  return buildMenuFromCache(userId);
}
