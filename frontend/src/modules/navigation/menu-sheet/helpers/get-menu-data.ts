import { appConfig, ContextEntityType } from 'config';
import { ContextEntityDataWithMembership } from '~/modules/me/types';
import { buildMenu } from '~/modules/navigation/menu-sheet/helpers/build-menu';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { flattenInfiniteData } from '~/query/basic';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';

/**
 * Retrieves user menu data and stores it in react query cache.
 * Uses revalidateIfStale to refetch stale data in the background.
 *
 * @returns The menu data.
 */
export async function getMenuData(opts?: { detailedMenu?: boolean }) {
  const userId = useUserStore.getState().user.id;
  console.debug('[getMenuData] Called for userId:', userId);

  const byType = new Map<ContextEntityType, ContextEntityDataWithMembership[]>();

  await Promise.all(
    appConfig.contextEntityTypes.map(async (entityType) => {
      const factory = getContextEntityTypeToListQueries()[entityType];
      if (!factory) return byType.set(entityType, []);

      const queryOpts = { ...factory({ userId }), revalidateIfStale: true };

      // Debug: check staleness before fetch
      const queryState = queryClient.getQueryState(queryOpts.queryKey);
      const isStale = queryState ? Date.now() - queryState.dataUpdatedAt > 60000 : true;
      console.debug(`[getMenuData] ${entityType}: dataUpdatedAt=${queryState?.dataUpdatedAt}, isStale=${isStale}`);

      const data = await queryClient.ensureInfiniteQueryData(queryOpts);
      byType.set(entityType, flattenInfiniteData<ContextEntityDataWithMembership>(data));
    }),
  );

  const menu = buildMenu(byType, appConfig.menuStructure, opts);

  return menu;
}
