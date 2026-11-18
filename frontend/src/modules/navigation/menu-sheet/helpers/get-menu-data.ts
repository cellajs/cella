import { appConfig } from 'shared';
import { getChannelListQuery } from '~/lib/entity-modules';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { buildMenuFromCache } from '~/modules/navigation/menu-sheet/helpers/build-menu-from-cache';
import { getCurrentUser } from '~/modules/user/user-store';
import { isNetworkError } from '~/query/offline/network-retry';
import { queryClient } from '~/query/query-client';

/** Enough pages for any member's lists: a fetch stops at the last page, and a refetch keeps the pages it holds. */
const menuListPages = 50;

/** A first read the server never answered leaves its list out until the reconnect refetch, which the menu observes: an offline boot with nothing cached still renders. */
const coldRead = (read: Promise<unknown>) =>
  read.catch((error) => {
    if (!isNetworkError(error)) throw error;
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

  // The menu joins each list row with the user's membership of it.
  const membershipsOptions = myMembershipsQueryOptions();
  await coldRead(queryClient.query({ ...membershipsOptions, staleTime: 'static' }));
  void queryClient.query(membershipsOptions).catch(() => {});

  await Promise.all(
    appConfig.channelEntityTypes.map(async (entityType) => {
      const listQuery = getChannelListQuery(entityType);
      if (!listQuery) return;
      const options = { ...listQuery({ memberUserId: userId }), pages: menuListPages };
      await coldRead(queryClient.infiniteQuery({ ...options, staleTime: 'static' }));
      void queryClient.infiniteQuery(options).catch(() => {});
    }),
  );

  return buildMenuFromCache(userId);
}
