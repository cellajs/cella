import type { PageEntityType } from 'config';
import { useEffect, useState } from 'react';
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
  const [entity, setEntity] = useState<PageEntitySummary | null>(null);

  const menu = useNavigationStore((s) => s.menu); // reactive subscription

  useEffect(() => {
    const queriesToWorkOn = queryClient.getQueriesData({});
    let cachedEntity: ItemData | null = null;

    const findInArbitrary = (data: ArbitraryEntityQueryData): ItemData | null => {
      for (const [key, value] of Object.entries(data)) {
        if (entityType === key) {
          if (Array.isArray(value)) {
            const found = value.find((item) => item.id === entityId);
            if (found) return found;
          } else if (value?.id === entityId) {
            return value;
          }
        }
        if (value && typeof value === 'object' && 'entityType' in value) {
          if (value.entityType === entityType && value.id === entityId) {
            return value as ItemData;
          }
        }
        if (Array.isArray(value)) {
          const found = value.find((el) => el.entityType === entityType && el.id === entityId);
          if (found) return found;
        }
      }
      return null;
    };

    for (const [, cachedData] of queriesToWorkOn) {
      if (!cachedData) continue;

      if (isQueryData<ItemData>(cachedData)) {
        cachedEntity = cachedData.items.find((item) => item.id === entityId) ?? null;
      } else if (isInfiniteQueryData<ItemData>(cachedData)) {
        cachedEntity = cachedData.pages.flatMap((p) => p.items).find((item) => item.id === entityId) ?? null;
      } else if (isArbitraryQueryData(cachedData)) {
        cachedEntity = findInArbitrary(cachedData);
      }
      if (cachedEntity) break;
    }

    if (!cachedEntity) {
      const menuItems = Object.values(menu).flat();
      const submenuItems = menuItems.flatMap(({ submenu }) => submenu ?? []);
      cachedEntity = menuItems.find((el) => el.id === entityId) || submenuItems.find((el) => el.id === entityId) || null;
    }

    if (cachedEntity) setEntity(cachedEntity as PageEntitySummary);
    // Fallback: fetch entity
    else getEntity({ path: { idOrSlug: entityId }, query: { type: entityType } }).then(setEntity);
  }, []);

  return entity;
};
