import type { MembershipBase } from 'sdk';
import { appConfig, type ChannelEntityType, menuSections } from 'shared';
import { getChannelListQuery } from '~/lib/entity-modules';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { buildMenu } from '~/modules/navigation/menu-sheet/helpers/build-menu';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { findMembership, getCachedMemberships } from '~/query/enrichment/helpers';
import { queryClient } from '~/query/query-client';

/** Entity types referenced by the menu structure (entity + subentity) */
export const menuEntityTypes = Array.from(
  new Set(menuSections.flatMap(({ entityType, subentityType }) => (subentityType ? [entityType, subentityType] : [entityType]))),
);

/** Menu items of one entity type from its list query data: the entities the user holds a membership of, joined with it. */
export const menuItemsFromList = (data: unknown, memberships: MembershipBase[]): UserMenuItem[] =>
  flattenInfiniteData<EnrichedChannel>(data).flatMap((item) => {
    const membership = findMembership(memberships, item.id);
    return membership ? [{ ...item, membership }] : [];
  });

export function buildMenuFromCache(userId: string): UserMenu {
  const memberships = getCachedMemberships() ?? [];
  const byType = new Map<ChannelEntityType, UserMenuItem[]>();

  for (const entityType of menuEntityTypes) {
    const listQuery = getChannelListQuery(entityType);
    const data = listQuery ? queryClient.getQueryData(listQuery({ relatableUserId: userId }).queryKey) : undefined;
    byType.set(entityType, menuItemsFromList(data, memberships));
  }

  return buildMenu(byType, appConfig.menuStructure);
}
