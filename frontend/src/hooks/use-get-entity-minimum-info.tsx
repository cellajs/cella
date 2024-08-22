import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigationStore } from '~/store/navigation';

import { getMinimumEntityInfo } from '~/api/general';
import type { ContextEntity, UserMenu, UserMenuItem, WorkspaceQuery, WorkspaceStoreProject } from '~/types';

export type EntityItem = {
  id: string;
  entity: ContextEntity;
  slug: string;
  name: string;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
};

const findItem = (
  items: (EntityItem & {
    submenu?: EntityItem[];
  })[],
  idOrSlug: string,
): EntityItem | null => {
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
  const [entity, setEntity] = useState({} as EntityItem);

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
      const queriesData = queryClient.getQueriesData<WorkspaceQuery | UserMenuItem[] | UserMenuItem>({});
      for (const query of queriesData) {
        const [[queryKey], data] = query;
        if (!data || !keys.includes(queryKey as keyof UserMenu)) continue;
        let arrayData = [];
        if ('workspace' in data) {
          arrayData = [data.workspace];
        } else if ('projects' in data) {
          arrayData = data.projects as WorkspaceStoreProject[];
        } else {
          arrayData = Array.isArray(data) ? data : [data];
        }

        const foundInCache = findItem(arrayData, idOrSlug);
        if (foundInCache) {
          setEntity(foundInCache);
          return;
        }
      }

      // Step 3: Fetch from API if not found in menu or cache
      const fetchedEntity = await getMinimumEntityInfo(idOrSlug, entityType);
      setEntity(fetchedEntity);
    };

    getEntity();
  }, [menu, idOrSlug, entityType, queryClient]);

  return entity;
};
