import { useQueries } from '@tanstack/react-query';
import { appConfig, type ContextEntityType } from 'config';
import { useMemo } from 'react';
import type { UserMenuItem } from '~/modules/me/types';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { flattenInfiniteData } from '~/query/basic';
import { buildMenu } from './build-menu';

/**
 * React hook that fetches and builds the user menu based on their memberships.
 *
 * @param userId - The ID of the user to fetch menu data for
 * @param opts - Optional configuration for building detailed menu with submenus
 * @returns An object containing the menu, loading state, and any errors
 */
export function useMenu(userId: string, opts?: { detailedMenu?: boolean }) {
  const detailedMenu = !!opts?.detailedMenu;

  // Types must be memoized to prevent useQueries from creating new query instances on every render
  const types = useMemo(
    () =>
      Array.from(
        new Set(appConfig.menuStructure.flatMap((s) => [s.entityType, s.subentityType].filter(Boolean))),
      ) as ContextEntityType[],
    [],
  );

  const results = useQueries({
    // @ts-ignore
    queries: types.map((t) => getContextEntityTypeToListQueries()[t]({ userId })),
  });

  // Stable recompute key when query data changes
  const recomputeKey = results.map((r) => r.dataUpdatedAt).join('|');

  // Build menu from query results - memoized to prevent infinite re-renders
  const menu = useMemo(() => {
    const byType = new Map<ContextEntityType, UserMenuItem[]>();

    types.forEach((t, i) => {
      const data = results[i]?.data as any;
      byType.set(t, data ? flattenInfiniteData<UserMenuItem>(data) : []);
    });

    return buildMenu(byType, appConfig.menuStructure, { detailedMenu });
  }, [detailedMenu, types, recomputeKey]);

  const isLoading = results.some((r) => r.isLoading);
  const error = results.find((r) => r.error)?.error;

  return { menu, isLoading, error };
}
