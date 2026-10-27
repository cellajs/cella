import { queryOptions } from '@tanstack/react-query';
// biome-ignore lint/style/noRestrictedImports: imperative cache prefetch helper for the router loader path; not eligible for a hook.
import { getMyMemberships } from 'sdk';
import { appConfig } from 'shared';
import { getChannelListQuery } from '~/lib/entity-modules';
import { meKeys } from '~/modules/me/query';
import { buildMenuFromCache } from '~/modules/navigation/menu-sheet/helpers/build-menu-from-cache';
import { getCurrentUser } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';

const membershipsOptions = queryOptions({
  queryKey: meKeys.memberships,
  queryFn: async ({ signal }) => getMyMemberships({ signal }),
  staleTime: 0,
});

/**
 * Builds the menu from cache, serving what is already cached and revalidating behind it.
 *
 * Each query is read twice: `staleTime: 'static'` ignores both staleness and invalidation, so only a cold
 * entry blocks the menu on the network, and the second read honors the options' own staleTime, so a stale
 * entry refetches behind the menu that already rendered.
 */
export async function getMenuData() {
  const userId = getCurrentUser().id;

  // Memberships come first: the cache subscriber (initChannelEnrichment) reads from this cache.
  await queryClient.query({ ...membershipsOptions, staleTime: 'static' });
  void queryClient.query(membershipsOptions).catch(() => {});

  // Fetch entity lists; the subscriber enriches them with memberships on cache write.
  await Promise.all(
    appConfig.channelEntityTypes.map(async (entityType) => {
      const listQuery = getChannelListQuery(entityType);
      if (!listQuery) return;
      const options = listQuery({ relatableUserId: userId });
      await queryClient.infiniteQuery({ ...options, staleTime: 'static' });
      void queryClient.infiniteQuery(options).catch(() => {});
    }),
  );

  return buildMenuFromCache(userId);
}
