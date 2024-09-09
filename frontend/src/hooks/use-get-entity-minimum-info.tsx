import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigationStore } from '~/store/navigation';

import type { ContextEntity, MinimumEntityItem, UserMenu, UserMenuItem } from '~/types/common';

const findItem = (
  items: (MinimumEntityItem & {
    submenu?: MinimumEntityItem[];
  })[],
  idOrSlug: string,
): MinimumEntityItem | null => {
  if (!items) return null;
  for (const item of items) {
    if (item.id === idOrSlug || item.slug === idOrSlug)
      return {
        id: item.id,
        entity: item.entity,
        slug: item.slug,
        name: item.name,
        thumbnailUrl: item.thumbnailUrl || null,
        bannerUrl: item.bannerUrl || null,
      };
    if (item.submenu) return findItem(item.submenu, idOrSlug);
  }
  return null;
};

export const useGetEntity = (idOrSlug: string, entityType: ContextEntity) => {
  const { menu } = useNavigationStore();
  const queryClient = useQueryClient();
  const [entity, setEntity] = useState({} as MinimumEntityItem);

  useEffect(() => {
    const getEntity = async () => {
      // Step 1: Check menu
      const keys = Object.keys(menu) as (keyof UserMenu)[];
      for (const category of keys) {
        const found = findItem(menu[category], idOrSlug);
        if (found) {
          setEntity(found);
          return;
        }
      }

      // Step 2: Check cache
      const queriesData = queryClient.getQueriesData<UserMenuItem[] | UserMenuItem>({});
      for (const query of queriesData) {
        const [[queryKey], data] = query;
        if (!data || !keys.includes(queryKey as keyof UserMenu)) continue;
        let arrayData = [];

        arrayData = Array.isArray(data) ? data : [data];

        const foundInCache = findItem(arrayData, idOrSlug);
        if (foundInCache) {
          setEntity(foundInCache);
          return;
        }
      }

      // TODO: fall back to fetching entity using their respective API GET endpoints
    };

    getEntity();
  }, [menu, idOrSlug, entityType, queryClient]);

  return entity;
};
