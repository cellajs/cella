import type { AnyRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { PageTab } from '~/modules/common/page/tab-nav';
import router from '~/routes/router';

function hasRoute<TRoutes extends Record<string, AnyRoute>>(
  routes: TRoutes,
  routeId: string,
): routeId is Extract<keyof TRoutes, string> {
  return routeId in routes;
}

function getChildRoutes(route: AnyRoute): AnyRoute[] {
  return Array.isArray(route.children) ? route.children : [];
}

/**
 * Extract navigation tabs from child routes based on their staticData.navTab configuration.
 * Only routes with navTab defined in staticData will be included.
 *
 * @param parentRouteId - The route ID of the parent route (e.g., '/system' or '/$tenantId/$orgSlug/organization')
 * @param filterTabIds - Optional array of tab IDs to include (for permission-based filtering)
 */
export function useNavTabs(parentRouteId: string, filterTabIds?: string[]): PageTab[] {
  return useMemo(() => {
    if (!parentRouteId) return [];

    const routesById = router.routesById;
    if (!hasRoute(routesById, parentRouteId)) return [];

    const parentRoute = routesById[parentRouteId];
    const children = getChildRoutes(parentRoute);

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
