import { appConfig } from 'shared';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';
import { buildMenuFromCache } from './build-menu-from-cache';

/**
 * Ensures entity data is in the cache and returns the user menu.
 * Fetches memberships first so the cache subscriber (initContextEntityEnrichment)
 * can enrich entity lists automatically, then delegates to buildMenuFromCache.
 *
 * @returns The menu data.
 */
export async function getMenuData(opts?: { detailedMenu?: boolean }) {
  const userId = useUserStore.getState().user.id;

  // Fetch memberships first — populates the cache that the subscriber reads from
  await queryClient.ensureQueryData({
    ...myMembershipsQueryOptions(),
    revalidateIfStale: true,
  });

  // Fetch entity lists — the subscriber enriches them with memberships on cache write
  await Promise.all(
    appConfig.contextEntityTypes.map(async (entityType) => {
      const factory = getContextEntityTypeToListQueries()[entityType];
      if (!factory) return;
      const queryOpts = factory({ relatableUserId: userId });
      await queryClient.ensureInfiniteQueryData({ ...queryOpts, revalidateIfStale: true } as any);
    }),
  );

  return buildMenuFromCache(userId, opts);
}
