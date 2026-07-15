import { appConfig, type ChannelEntityType } from 'shared';
import { channelEntityListQueriesByType } from '~/list-queries-config';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { queryClient } from '~/query/query-client';
import { buildMenu } from './build-menu';

/** Entity types referenced by the menu structure (entity + subentity) */
const menuEntityTypes = Array.from(
  new Set(appConfig.menuStructure.flatMap((s) => [s.entityType, s.subentityType].filter(Boolean))),
) as ChannelEntityType[];

/**
 * Builds the user menu from cached entity data. Assumes entity lists were already enriched with
 * memberships by the cache subscriber (initChannelEntityEnrichment). Used by useMenu + getMenuData.
 */
export function buildMenuFromCache(userId: string): UserMenu {
  const registry = channelEntityListQueriesByType;
  const byType = new Map<ChannelEntityType, UserMenuItem[]>();

  for (const entityType of menuEntityTypes) {
    const factory = registry[entityType];
    if (!factory) {
      byType.set(entityType, []);
      continue;
    }

    const data = queryClient.getQueryData(factory({ relatableUserId: userId }).queryKey);
    // biome-ignore lint/suspicious/noExplicitAny: query data shape is heterogeneous across entity types.
    const items = data ? flattenInfiniteData<any>(data as any) : [];

    byType.set(
      entityType,
      items.filter((item): item is UserMenuItem => !!(item as Partial<UserMenuItem>).membership),
    );
  }

  return buildMenu(byType, appConfig.menuStructure);
}

/** The menu entity types used for query subscriptions */
export { menuEntityTypes };
