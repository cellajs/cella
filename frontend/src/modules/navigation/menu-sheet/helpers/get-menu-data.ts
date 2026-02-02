import { appConfig, ContextEntityType } from 'config';
import { ContextEntityDataWithMembership } from '~/modules/me/types';
import { buildMenu } from '~/modules/navigation/menu-sheet/helpers/build-menu';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { flattenInfiniteData } from '~/query/basic';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';

/**
 * Retrieves user menu data and stores it in react query cache.
 *
 * @returns The menu data.
 */
export async function getMenuData(opts?: { detailedMenu?: boolean }) {
  const userId = useUserStore.getState().user.id;
  const byType = new Map<ContextEntityType, ContextEntityDataWithMembership[]>();

  await Promise.all(
    appConfig.contextEntityTypes.map(async (entityType) => {
      const factory = getContextEntityTypeToListQueries()[entityType];
      if (!factory) return byType.set(entityType, []);

      const queryOpts = { ...factory({ userId }) };

      const data = await queryClient.ensureInfiniteQueryData(queryOpts);
      byType.set(entityType, flattenInfiniteData<ContextEntityDataWithMembership>(data));
    }),
  );

  const menu = buildMenu(byType, appConfig.menuStructure, opts);

  return menu;
}
