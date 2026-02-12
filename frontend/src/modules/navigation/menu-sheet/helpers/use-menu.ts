import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { appConfig, type ContextEntityType } from 'shared';
import type { UserMenuItem } from '~/modules/me/types';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { flattenInfiniteData } from '~/query/basic';
import { buildMenu } from './build-menu';

/**
 * React hook that fetches and builds the user menu based on their memberships.
 *
 * @param userId - The ID of the user to fetch menu data for (optional - queries disabled when undefined)
 * @param opts - Optional configuration for building detailed menu with submenus
 * @returns An object containing the menu, loading state, and any errors
 */
export function useMenu(userId: string | undefined, opts?: { detailedMenu?: boolean }) {
  const detailedMenu = !!opts?.detailedMenu;

  // Memoize registry so useQueries sees stable configs across renders
  const contextEntityQueryRegistry = useMemo(() => getContextEntityTypeToListQueries(), []);

  // Types must be memoized to prevent useQueries from creating new query instances on every render
  const types = useMemo(
    () =>
      Array.from(
        new Set(appConfig.menuStructure.flatMap((s) => [s.entityType, s.subentityType].filter(Boolean))),
      ) as ContextEntityType[],
    [],
  );

  const results = useQueries({
    // @ts-expect-error useQueries types don't support infinite query options, but it works at runtime
    queries: types.map((t) => ({
      ...contextEntityQueryRegistry[t]?.({ userId: userId ?? '' }),
      enabled: !!userId,
    })),
  });

  // Stable recompute key when query data changes
  const recomputeKey = results.map((r) => r.dataUpdatedAt).join('|');

  // Build menu from query results - memoized to prevent infinite re-renders
  const menu = useMemo(() => {
    const byType = new Map<ContextEntityType, UserMenuItem[]>();

    types.forEach((t, i) => {
      const data = results[i]?.data;
      // biome-ignore lint/suspicious/noExplicitAny: useQueries union types don't narrow per-index
      const items = data ? flattenInfiniteData<UserMenuItem>(data as any) : [];
      byType.set(t, items);
    });

    return buildMenu(byType, appConfig.menuStructure, { detailedMenu });
  }, [detailedMenu, types, recomputeKey]);

  const isLoading = results.some((r) => r.isLoading || r.isPending);
  const error = results.find((r) => r.error)?.error;

  return { menu, isLoading, error };
}
