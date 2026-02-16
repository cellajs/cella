import { appConfig, ContextEntityType } from 'shared';
import type { MembershipBase } from '~/api.gen';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { ContextEntityWithMembership } from '~/modules/me/types';
import { buildMenu } from '~/modules/navigation/menu-sheet/helpers/build-menu';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { flattenInfiniteData } from '~/query/basic';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';

/**
 * Retrieves user menu data and stores it in react query cache.
 * Fetches memberships first to enable entity enrichment.
 *
 * @returns The menu data.
 */
export async function getMenuData(opts?: { detailedMenu?: boolean }) {
  const userId = useUserStore.getState().user.id;

  // Fetch memberships first - this populates the memberships cache
  const membershipsData = await queryClient.ensureQueryData({
    ...myMembershipsQueryOptions(),
    revalidateIfStale: true,
  });

  // Create a map for quick membership lookup by entity, keyed by the entity id from entityIdColumnKeys
  const membershipsByEntity = new Map<string, MembershipBase>();
  for (const m of membershipsData.items) {
    const entityId = m[appConfig.entityIdColumnKeys[m.contextType]];
    if (entityId) membershipsByEntity.set(entityId, m);
  }

  const byType = new Map<ContextEntityType, ContextEntityWithMembership[]>();

  await Promise.all(
    appConfig.contextEntityTypes.map(async (entityType) => {
      const factory = getContextEntityTypeToListQueries()[entityType];
      if (!factory) return byType.set(entityType, []);

      const queryOpts = { ...factory({ userId }) };

      const data = await queryClient.ensureInfiniteQueryData({ ...queryOpts, revalidateIfStale: true } as any);
      // biome-ignore lint/suspicious/noExplicitAny: queryOpts is heterogeneous
      const items = flattenInfiniteData<any>(data as any);

      // Enrich entities with membership from the memberships cache
      const enrichedItems = items
        .map((item: any) => {
          // Look up membership from cache, fallback to included.membership
          const membership = membershipsByEntity.get(item.id) ?? item.included?.membership;
          if (!membership) return null; // Skip entities without membership
          return { ...item, membership };
        })
        .filter((item: any): item is ContextEntityWithMembership => item !== null);

      byType.set(entityType, enrichedItems);
    }),
  );

  const menu = buildMenu(byType, appConfig.menuStructure, opts);

  return menu;
}
