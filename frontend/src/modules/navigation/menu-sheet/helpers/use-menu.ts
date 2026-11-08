import { useQuery } from '@tanstack/react-query';
import { appConfig, type ChannelEntityType } from 'shared';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import type { UserMenuItem } from '~/modules/me/types';
import { buildMenu } from '~/modules/navigation/menu-sheet/helpers/build-menu';
import { menuEntityTypes, menuItemsFromList } from '~/modules/navigation/menu-sheet/helpers/build-menu-from-cache';
import { useChannelListQueries } from '~/query/basic/use-channel-list-queries';

/**
 * The menu, rebuilt whenever one of its entity lists or the user's memberships change. It is built from the query
 * results themselves, never from a cache read keyed on their update times: the React Compiler drops a value that only
 * sits in a dependency array, and the menu then stays as it was after a mute, a hide or a reorder.
 */
export function useMenu(userId: string | undefined) {
  const lists = useChannelListQueries(menuEntityTypes, { relatableUserId: userId ?? '' }, !!userId);
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());

  const itemsByType = new Map<ChannelEntityType, UserMenuItem[]>(menuEntityTypes.map((entityType) => [entityType, []]));
  for (const list of lists) itemsByType.set(list.entityType, menuItemsFromList(list.query.data, myMemberships?.results ?? []));
  const menu = buildMenu(itemsByType, appConfig.menuStructure);

  const isLoading = lists.some(({ query }) => query.isPending);
  const error = lists.find(({ query }) => query.error)?.query.error;

  return { menu, isLoading, error };
}
