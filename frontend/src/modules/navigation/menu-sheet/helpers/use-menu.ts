import { appConfig, type ChannelEntityType } from 'shared';
import type { UserMenuItem } from '~/modules/me/types';
import { buildMenu } from '~/modules/navigation/menu-sheet/helpers/build-menu';
import { menuEntityTypes, menuItemsFromList } from '~/modules/navigation/menu-sheet/helpers/build-menu-from-cache';
import { useChannelListQueries } from '~/query/basic/use-channel-list-queries';

/**
 * The menu, rebuilt whenever one of its entity lists changes: the cache subscriber enriches those lists with the
 * user's memberships. It is built from the query results themselves, never from a cache read keyed on their update
 * times: the React Compiler drops a value that only sits in a dependency array, and the menu then stays as it was
 * after a mute, an archive or a reorder.
 */
export function useMenu(userId: string | undefined) {
  const lists = useChannelListQueries(menuEntityTypes, { relatableUserId: userId ?? '' }, !!userId);

  const itemsByType = new Map<ChannelEntityType, UserMenuItem[]>(menuEntityTypes.map((entityType) => [entityType, []]));
  for (const list of lists) itemsByType.set(list.entityType, menuItemsFromList(list.query.data));
  const menu = buildMenu(itemsByType, appConfig.menuStructure);

  const isLoading = lists.some(({ query }) => query.isPending);
  const error = lists.find(({ query }) => query.error)?.query.error;

  return { menu, isLoading, error };
}
