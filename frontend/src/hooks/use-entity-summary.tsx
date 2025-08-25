import { useQuery } from '@tanstack/react-query';
import { appConfig, type ContextEntityType, type PageEntityType } from 'config';
import { useMemo } from 'react';
import { getEntity, getUser } from '~/api.gen';
import type { EntitySummary } from '~/modules/entities/types';
import type { UserMenuItem } from '~/modules/me/types';
import type { UserSummary } from '~/modules/users/types';
import { isInfiniteQueryData, isQueryData } from '~/query/helpers/mutate-query';
import { queryClient } from '~/query/query-client';
import { useNavigationStore } from '~/store/navigation';

type Props<T extends PageEntityType> = { idOrSlug: string; entityType: T; cacheOnly?: boolean };
// Conditional type to infer return type based on entityType
type EntityReturnType<T extends PageEntityType> = T extends 'user' ? UserSummary : EntitySummary;

const contextEntityTypes: readonly string[] = appConfig.contextEntityTypes;

export const useEntitySummary = <T extends PageEntityType>({
  idOrSlug,
  entityType,
  cacheOnly = false,
}: Props<T>): EntityReturnType<T> | undefined => {
  const isContextEntity = contextEntityTypes.includes(entityType);
  const menu = useNavigationStore((s) => s.menu);

  // Helper to match entity by id or slug
  const matchEntity = (item: EntityReturnType<T> | UserMenuItem) => item.id === idOrSlug || item.slug === idOrSlug;

  // Search React Query cache
  const findInCache = (): EntityReturnType<T> | undefined => {
    const queryKey = isContextEntity ? [entityType] : {};
    const queries = queryClient.getQueriesData({ queryKey });

    for (const [, cachedData] of queries) {
      if (!cachedData) continue;

      if (isQueryData<EntityReturnType<T>>(cachedData)) {
        const found = cachedData.items.find(matchEntity);
        if (found) return found;
      } else if (isInfiniteQueryData<EntityReturnType<T>>(cachedData)) {
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

    return;
  };

  // Search menu for entity
  const findInMenu = (): EntityReturnType<ContextEntityType> | undefined => {
    const menuItems = Object.values(menu).flat();
    const submenuItems = menuItems.flatMap(({ submenu }) => submenu ?? []);
    return menuItems.find(matchEntity) || submenuItems.find(matchEntity);
  };

  // Memoized cached entity from cache or menu
  const cachedEntity = useMemo(() => {
    const entityFromCache = findInCache();
    // infer type to match targe
    if (isContextEntity) return entityFromCache || (findInMenu() as EntityReturnType<T>);
    return entityFromCache;
  }, [entityType, idOrSlug, menu]);

  // Return cached entity directly if cacheOnly, otherwise would use useQuery
  if (cacheOnly) return cachedEntity;

  // Fetch entity if not already cached or if cached but partial
  const { data } = useQuery({
    queryKey: [entityType, idOrSlug], // Set key with structure we already use for page entities
    queryFn: async () =>
      isContextEntity ? await getEntity({ path: { idOrSlug }, query: { type: entityType } }) : await getUser({ path: { idOrSlug } }),
    enabled: !cachedEntity,
    // biome-ignore lint/suspicious/noExplicitAny: // TODO fix after merge new entities endpoint
    initialData: cachedEntity as any,
  });

  return data;
};
