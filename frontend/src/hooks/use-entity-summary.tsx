import { useQuery } from '@tanstack/react-query';
import type { PageEntityType } from 'config';
import { useMemo } from 'react';
import { getEntity } from '~/api.gen';
import type { EntitySummary } from '~/modules/entities/types';
import { isInfiniteQueryData, isQueryData } from '~/query/helpers/mutate-query';
import { isArbitraryQueryData } from '~/query/hooks/use-mutate-query-data/helpers';
import type { ArbitraryEntityQueryData, ItemData } from '~/query/hooks/use-mutate-query-data/types';
import { queryClient } from '~/query/query-client';
import { useNavigationStore } from '~/store/navigation';

type PageEntitySummary = Omit<EntitySummary, 'entityType'> & { entityType: PageEntityType };

export const useEntitySummary = (parent: { id: string; entityType: PageEntityType }) => {
  const { id: entityId, entityType } = parent;
  const menu = useNavigationStore((s) => s.menu);

  // Try to resolve entity from cache/menu before hitting API
  const cachedEntity = useMemo(() => {
    const queriesToWorkOn = queryClient.getQueriesData({});
    let found: ItemData | null = null;

    const findInArbitrary = (data: ArbitraryEntityQueryData): ItemData | null => {
      for (const [key, value] of Object.entries(data)) {
        if (entityType === key) {
          if (Array.isArray(value)) return value.find((item) => item.id === entityId) || null;
          if (value.id === entityId) return value;
        }
        if (value && typeof value === 'object' && 'entityType' in value && value.entityType === entityType && value.id === entityId) {
          return value;
        }
        if (Array.isArray(value)) return value.find((el) => el.entityType === entityType && el.id === entityId) || null;
      }
      return null;
    };

    for (const [, cachedData] of queriesToWorkOn) {
      if (!cachedData) continue;

      if (isQueryData<ItemData>(cachedData)) {
        found = cachedData.items.find((item) => item.id === entityId) ?? null;
      } else if (isInfiniteQueryData<ItemData>(cachedData)) {
        found = cachedData.pages.flatMap((p) => p.items).find((item) => item.id === entityId) ?? null;
      } else if (isArbitraryQueryData(cachedData)) {
        found = findInArbitrary(cachedData);
      }
      if (found) break;
    }

    if (!found) {
      const menuItems = Object.values(menu).flat();
      const submenuItems = menuItems.flatMap(({ submenu }) => submenu ?? []);
      found = menuItems.find((el) => el.id === entityId) || submenuItems.find((el) => el.id === entityId) || null;
    }

    return found as PageEntitySummary | null;
  }, [menu]);

  // If cachedEntity exists, skip fetching
  const { data } = useQuery<PageEntitySummary | null>({
    queryKey: ['entitySummary', entityType, entityId],
    queryFn: () => getEntity({ path: { idOrSlug: entityId }, query: { type: entityType } }),
    enabled: !cachedEntity, // don’t fetch if we already have it
    initialData: cachedEntity, // hydrate from cache/menu
  });

  return data;
};
