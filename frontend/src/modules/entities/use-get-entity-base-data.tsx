import { appConfig, type ContextEntityType } from 'config';
import { useMemo } from 'react';
import { type ContextEntityBase, type UserBase } from '~/api.gen';
import { queryClient } from '~/query/query-client';
import { isInfiniteQueryData, isQueryData } from '~/query/utils/mutate-query';
import { useNavigationStore } from '~/store/navigation';

const contextEntityTypesConst = appConfig.contextEntityTypes as readonly ContextEntityType[];

function isContextEntityType(t: ContextEntityType | 'user'): t is ContextEntityType {
  return (contextEntityTypesConst as readonly string[]).includes(t);
}

type WithIdSlug = { id?: string | null; slug?: string | null };

// user overload
export function useGetEntityBaseData(args: { idOrSlug: string; entityType: ContextEntityType | 'user' }): UserBase | undefined;

// context entities overload
export function useGetEntityBaseData<T extends ContextEntityType>(args: { idOrSlug: string; entityType: T }): ContextEntityBase | undefined;

/**
 * Get base data for an entity (context entity or user) from React Query cache or navigation menu
 */
export function useGetEntityBaseData(args: { idOrSlug: string; entityType: ContextEntityType | 'user' }) {
  const { idOrSlug, entityType } = args;

  const menu = useNavigationStore((s) => s.menu);
  const isContext = isContextEntityType(entityType);

  const matchEntity = (item: WithIdSlug) => item.id === idOrSlug || item.slug === idOrSlug;

  // Search React Query cache
  const findInCache = () => {
    const queryKey = isContext ? [entityType] : {};
    const queries = queryClient.getQueriesData({ queryKey });

    for (const [, cachedData] of queries) {
      if (!cachedData) continue;

      // 1: Standard query data with items array
      if (isQueryData<WithIdSlug>(cachedData)) {
        const found = cachedData.items.find(matchEntity);
        if (found) return found;
      } else if (isInfiniteQueryData<WithIdSlug>(cachedData)) {
        // 2: Infinite query data with paginated items
        const found = cachedData.pages.flatMap(({ items }) => items).find(matchEntity);
        if (found) return found;
      } else if (typeof cachedData === 'object') {
        // 3: Generic object - check all values for arrays or single entities
        for (const value of Object.values(cachedData)) {
          if (Array.isArray(value)) {
            // 3a: Array of entities
            const found = (value as WithIdSlug[]).find(matchEntity);
            if (found) return found;
          } else if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
            // 3b: Single entity object
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
    return (menuItems.find(matchEntity) || submenuItems.find(matchEntity)) as ContextEntityBase | undefined;
  };

  const cachedEntity = useMemo(() => {
    const fromCache = findInCache();

    if (fromCache) return fromCache;
    if (isContext) return findInMenu();

    return undefined;
  }, [entityType, idOrSlug, menu]);

  return cachedEntity as UserBase | ContextEntityBase | undefined;
}
