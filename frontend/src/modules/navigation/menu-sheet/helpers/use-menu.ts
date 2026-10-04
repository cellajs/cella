import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { appConfig, type ChannelEntityType } from 'shared';
import { getChannelListQuery } from '~/lib/entity-modules';
import type { UserMenuItem } from '~/modules/me/types';
import { buildMenu } from './build-menu';
import { menuEntityTypes, menuItemsFromList } from './build-menu-from-cache';

/**
 * The menu, rebuilt whenever one of its entity lists changes: the cache subscriber enriches those lists with the
 * user's memberships. It is built from the query results themselves, never from a cache read keyed on their update
 * times: the React Compiler drops a value that only sits in a dependency array, and the menu then stays as it was
 * after a mute, an archive or a reorder.
 */
export function useMenu(userId: string | undefined) {
  // Entity types without a registered list query are dropped here, so no entry reaches useQueries without a queryKey.
  const lists = menuEntityTypes.flatMap((entityType) => {
    const factory = getChannelListQuery(entityType);
    return factory ? [{ entityType, options: { ...factory({ relatableUserId: userId ?? '' }), enabled: !!userId } }] : [];
  });

  const results = useQueries({
    queries: lists.map(({ options }) => options),
  });

  const menu = useMemo(() => {
    const itemsByType = new Map<ChannelEntityType, UserMenuItem[]>(menuEntityTypes.map((entityType) => [entityType, []]));
    for (const [index, { entityType }] of lists.entries()) itemsByType.set(entityType, menuItemsFromList(results[index]?.data));
    return buildMenu(itemsByType, appConfig.menuStructure);
  }, [lists, results]);

  const isLoading = results.some((r) => r.isLoading || r.isPending);
  const error = results.find((r) => r.error)?.error;

  return { menu, isLoading, error };
}
