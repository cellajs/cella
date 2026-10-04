import { appConfig, type ChannelEntityType } from 'shared';
import { getChannelListQuery } from '~/lib/entity-modules';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { queryClient } from '~/query/query-client';
import { buildMenu } from './build-menu';

/** Entity types referenced by the menu structure (entity + subentity) */
const menuEntityTypes = Array.from(
  new Set(appConfig.menuStructure.flatMap((s) => [s.entityType, s.subentityType].filter(Boolean))),
) as ChannelEntityType[];

/** Menu items of one entity type from its list query data: the entities that carry the user's membership. */
export const menuItemsFromList = (data: unknown): UserMenuItem[] => {
  // biome-ignore lint/suspicious/noExplicitAny: query data shape is heterogeneous across entity types.
  const items = data ? flattenInfiniteData<any>(data as any) : [];
  return items.filter((item): item is UserMenuItem => !!(item as Partial<UserMenuItem>).membership);
};

/** Assumes entity lists were already enriched with memberships by the cache subscriber (initChannelEnrichment). */
export function buildMenuFromCache(userId: string): UserMenu {
  const byType = new Map<ChannelEntityType, UserMenuItem[]>();

  for (const entityType of menuEntityTypes) {
    const factory = getChannelListQuery(entityType);
    byType.set(entityType, factory ? menuItemsFromList(queryClient.getQueryData(factory({ relatableUserId: userId }).queryKey)) : []);
  }

  return buildMenu(byType, appConfig.menuStructure);
}

export { menuEntityTypes };
