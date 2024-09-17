import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getMinimumEntity } from '~/api/general';
import { useNavigationStore } from '~/store/navigation';

import type { workspaceWithProjectSchema } from 'backend/modules/workspaces/schema';
import type { z } from 'zod';
import type { Project } from '~/types/app';
import type { ContextEntity, MinimumEntityItem, UserMenu, UserMenuItem } from '~/types/common';

type WorkspaceQuery = z.infer<typeof workspaceWithProjectSchema>;

// Recursive function to find an item by id or slug
const findItem = (items: (MinimumEntityItem & { submenu?: MinimumEntityItem[] })[], idOrSlug: string): MinimumEntityItem | null => {
  if (!items || items.length === 0) return null;

  for (const item of items) {
    if (item.id === idOrSlug || item.slug === idOrSlug) {
      return {
        id: item.id,
        entity: item.entity,
        slug: item.slug,
        name: item.name,
        thumbnailUrl: item.thumbnailUrl || null,
        bannerUrl: item.bannerUrl || null,
      };
    }
    // Recursively search in submenu if exists
    if (item.submenu && item.submenu.length > 0) {
      const found = findItem(item.submenu, idOrSlug);
      if (found) return found;
    }
  }

  return null;
};
// Hook to fetch an entity based on id or slug
export const useGetEntity = (idOrSlug: string, entityType: ContextEntity) => {
  const { menu } = useNavigationStore();
  const queryClient = useQueryClient();
  const [entity, setEntity] = useState({} as MinimumEntityItem);

  useEffect(() => {
    const getEntity = async () => {
      // Step 1: Check for entity in menu
      const keys = Object.keys(menu) as (keyof UserMenu)[];
      for (const category of keys) {
        const found = findItem(menu[category], idOrSlug);
        if (found) {
          setEntity(found);
          return;
        }
      }

      // Step 2: Check for entity in queries cache
      const queriesData = queryClient.getQueriesData<WorkspaceQuery | UserMenuItem[] | UserMenuItem>({});
      for (const query of queriesData) {
        const [[queryKey], data] = query;
        if (!data || !keys.includes(queryKey as keyof UserMenu)) continue;
        let arrayData = [];
        if ('workspace' in data) {
          arrayData = [data.workspace];
        } else if ('projects' in data) {
          arrayData = data.projects as Project[];
        } else {
          arrayData = Array.isArray(data) ? data : [data];
        }

        const foundInCache = findItem(arrayData, idOrSlug);
        if (foundInCache) {
          setEntity(foundInCache);
          return;
        }
      }

      // Step 3: Fetch minimum entity data from BE
      const fetchedEntity = await getMinimumEntity({ idOrSlug, entityType });
      if (fetchedEntity) setEntity(fetchedEntity);
      return;
    };

    getEntity();
  }, [menu, idOrSlug, entityType, queryClient]);

  return entity;
};
