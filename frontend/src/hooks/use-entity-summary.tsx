import { useQuery } from '@tanstack/react-query';
import type { PageEntityType } from 'config';
import { useMemo } from 'react';
import { getEntity } from '~/api.gen';
import type { EntitySummary } from '~/modules/entities/types';
import { isInfiniteQueryData, isQueryData } from '~/query/helpers/mutate-query';
import { queryClient } from '~/query/query-client';
import { useNavigationStore } from '~/store/navigation';

type PageEntitySummary = Omit<EntitySummary, 'entityType'> & { entityType: PageEntityType };
type CachedEntityItem = { id: string; entityType: PageEntityType; slug?: string };
type Props = { idOrSlug: string; entityType: PageEntityType; cacheOnly?: boolean };

export const useEntitySummary = ({ idOrSlug, entityType, cacheOnly = false }: Props) => {
  const menu = useNavigationStore((s) => s.menu);

  // Helper to match entity by id or slug
  const matchEntity = (item: CachedEntityItem) => item.id === idOrSlug || item.slug === idOrSlug;

  // Search react-query cache for entity
  const findInCache = (): CachedEntityItem | null => {
    // TODO
    // const queryKey = appConfig.contextEntityTypes.includes(entityType) ? [entityType] : [];
    const queries = queryClient.getQueriesData({ queryKey: [entityType] });

    for (const [, cachedData] of queries) {
      if (!cachedData) continue;

      if (isQueryData<CachedEntityItem>(cachedData)) {
        const found = cachedData.items.find(matchEntity);
        if (found) return found;
      } else if (isInfiniteQueryData<CachedEntityItem>(cachedData)) {
        const found = cachedData.pages.flatMap(({ items }) => items).find(matchEntity);
        if (found) return found;
      } else if (typeof cachedData === 'object') {
        for (const value of Object.values(cachedData)) {
          if (Array.isArray(value)) {
            const found = value.find(matchEntity);
            if (found) return found;
          } else if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
            if (matchEntity(value)) return value;
          }
        }
      }
    }

    return null;
  };

  // Search menu for entity
  const findInMenu = (): CachedEntityItem | null => {
    const menuItems = Object.values(menu).flat();
    const submenuItems = menuItems.flatMap(({ submenu }) => submenu ?? []);

    return menuItems.find(matchEntity) || submenuItems.find(matchEntity) || null;
  };

  // Memoized cached entity from cache or menu
  const cachedEntity = useMemo(() => (findInCache() || findInMenu()) as PageEntitySummary | null, [entityType, idOrSlug, menu]);

  // Return cached entity directly if cacheOnly, otherwise would use useQuery
  if (cacheOnly) return cachedEntity;

  // Fetch entity if not already cached
  const { data } = useQuery<PageEntitySummary | null>({
    queryKey: [entityType, idOrSlug], // Set key with structure we already use for page entities
    queryFn: () => getEntity({ path: { idOrSlug }, query: { type: entityType } }),
    enabled: !cachedEntity, // don’t fetch if we already have it
    initialData: cachedEntity, // hydrate from cache/menu
  });

  return data;
};
