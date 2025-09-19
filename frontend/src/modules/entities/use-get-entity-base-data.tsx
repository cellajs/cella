import { useQuery } from '@tanstack/react-query';
import { appConfig, type ContextEntityType } from 'config';
import { useMemo } from 'react';
import { type ContextEntityBaseSchema, getContextEntity, getUser, type UserBaseSchema } from '~/api.gen';
import { entitiesKeys } from '~/modules/entities/query';
import { queryClient } from '~/query/query-client';
import { isInfiniteQueryData, isQueryData } from '~/query/utils/mutate-query';
import { useNavigationStore } from '~/store/navigation';

const contextEntityTypesConst = appConfig.contextEntityTypes as readonly ContextEntityType[];

function isContextEntityType(t: ContextEntityType | 'user'): t is ContextEntityType {
  return (contextEntityTypesConst as readonly string[]).includes(t);
}

type WithIdSlug = { id?: string | null; slug?: string | null };

// user overload
export function useGetEntityBaseData(args: {
  idOrSlug: string;
  entityType: ContextEntityType | 'user';
  cacheOnly?: boolean;
}): UserBaseSchema | undefined;

// context entities overload
export function useGetEntityBaseData<T extends ContextEntityType>(args: {
  idOrSlug: string;
  entityType: T;
  cacheOnly?: boolean;
}): ContextEntityBaseSchema | undefined;

// ——— implementation ———
export function useGetEntityBaseData(args: { idOrSlug: string; entityType: ContextEntityType | 'user'; cacheOnly?: boolean }) {
  const { idOrSlug, entityType, cacheOnly = false } = args;

  const menu = useNavigationStore((s) => s.menu);
  const isContext = isContextEntityType(entityType);

  const matchEntity = (item: WithIdSlug) => item.id === idOrSlug || item.slug === idOrSlug;

  // Search React Query cache
  const findInCache = () => {
    const queryKey = isContext ? [entityType] : {};
    const queries = queryClient.getQueriesData({ queryKey });

    for (const [, cachedData] of queries) {
      if (!cachedData) continue;

      if (isQueryData<WithIdSlug>(cachedData)) {
        const found = cachedData.items.find(matchEntity);
        if (found) return found;
      } else if (isInfiniteQueryData<WithIdSlug>(cachedData)) {
        const found = cachedData.pages.flatMap(({ items }) => items).find(matchEntity);
        if (found) return found;
      } else if (typeof cachedData === 'object') {
        for (const value of Object.values(cachedData)) {
          if (Array.isArray(value)) {
            const found = (value as WithIdSlug[]).find(matchEntity);
            if (found) return found;
          } else if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
            if (matchEntity(value as WithIdSlug)) return value;
          }
        }
      }
    }
    return undefined;
  };

  // Search menu (only for context entities)
  const findInMenu = () => {
    if (!isContext) return undefined;
    const menuItems = Object.values(menu).flat();
    const submenuItems = menuItems.flatMap(({ submenu }) => submenu ?? []);
    return (menuItems.find(matchEntity) || submenuItems.find(matchEntity)) as ContextEntityBaseSchema | undefined;
  };

  const cachedEntity = useMemo(() => {
    const fromCache = findInCache();

    if (fromCache) return fromCache;
    if (isContext) return findInMenu();

    return undefined;
  }, [entityType, idOrSlug, menu]);

  if (cacheOnly) return cachedEntity as UserBaseSchema | ContextEntityBaseSchema | undefined;

  const { data } = useQuery({
    queryKey: entitiesKeys.single(idOrSlug, entityType),
    queryFn: async () => {
      if (entityType === 'user') return await getUser({ path: { idOrSlug } });

      return await getContextEntity({
        path: { idOrSlug },
        query: { entityType },
      });
    },
    enabled: !cachedEntity,
    initialData: cachedEntity,
  });

  return data;
}
