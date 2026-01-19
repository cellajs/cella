import type { AnyRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import router from '~/lib/router';
import type { PageTab } from '~/modules/common/page/nav';

/**
 * Extract navigation tabs from child routes based on their staticData.navTab configuration.
 * Only routes with navTab defined in staticData will be included.
 *
 * @param parentRouteId - The route ID of the parent route (e.g., '/system' or '/organization/$idOrSlug')
 * @param filterTabIds - Optional array of tab IDs to include (for permission-based filtering)
 */
export function useNavTabs(parentRouteId: string, filterTabIds?: string[]): PageTab[] {
  return useMemo(() => {
    if (!parentRouteId) return [];

    const parentRoute = router.routesById[parentRouteId as keyof typeof router.routesById] as AnyRoute | undefined;
    if (!parentRoute) return [];

    // Get children from the route tree
    const children = (parentRoute.children ?? []) as AnyRoute[];

    // Extract tabs from child routes that have navTab in staticData
    const tabs: PageTab[] = children
      .map((route) => {
        const navTab = route.options?.staticData?.navTab;
        if (!navTab) return null;
        return {
          id: navTab.id,
          label: navTab.label,
          path: route.fullPath as PageTab['path'],
        };
      })
      .filter((tab): tab is PageTab => tab !== null);

    // Apply filter if provided
    if (filterTabIds) {
      return tabs.filter((tab) => filterTabIds.includes(tab.id));
    }

    return tabs;
  }, [parentRouteId, filterTabIds?.join(',')]);
}
