import { buildEntitySyncQueries } from '~/list-queries-config';
import type { UserMenuItem } from '~/modules/me/types';
import { queryClient } from '~/query/query-client';
import { waitFor } from '~/utils/wait-for';
import { getRouteOrgId } from './sync-priority';

// Extended gc time for offline caching. staleTime is left unset so product queries keep their own syncStaleTime and ensureQueryData skips fresh caches after catchup.
const syncQueryConfig = {
  gcTime: 24 * 60 * 60 * 1000, // 24 hours
};

/** Resolves current-organization staleness once the stream is live, and fills other offline caches when enabled. `signal` cancels on unmount or retrigger. */
export async function runSyncService(offlineAccess: boolean, signal: AbortSignal): Promise<void> {
  // Brief wait so a fleet of tabs does not all hit the server at connect time.
  await waitFor(1000);
  if (signal.aborted) return;

  // Menu comes from already-cached entity lists; imported dynamically to avoid HMR coupling.
  const { getMenuData } = await import('~/modules/navigation/menu-sheet/helpers/get-menu-data');
  const menu = await getMenuData();
  if (signal.aborted) return;

  const allItems = flattenMenuItems(menu);
  if (allItems.length === 0) return;

  const routeOrgId = getRouteOrgId();

  const highPriority = allItems.filter((item) => item.organizationId === routeOrgId || item.id === routeOrgId);
  const lowPriority = allItems.filter((item) => item.organizationId !== routeOrgId && item.id !== routeOrgId);

  for (const item of highPriority) {
    if (signal.aborted) return;
    await syncMenuItem(item, offlineAccess);
  }

  // Without offlineAccess, React Query hooks refetch other orgs on navigation.
  if (offlineAccess) {
    for (const item of lowPriority) {
      if (signal.aborted) return;
      await waitFor(500); // Stagger requests to avoid server overload
      await syncMenuItem(item, offlineAccess);
    }
  }

  console.debug(
    `[SyncService] Complete: ${highPriority.length} high-priority, ${offlineAccess ? lowPriority.length : 0} low-priority`,
  );
}

/** Refetches through ensureQueryData only when catchup marked the list stale; a fresh list is a no-op. */
async function syncMenuItem(item: UserMenuItem, offlineAccess: boolean): Promise<void> {
  if (item.membership.archived) return;

  // For an organization the entity is the org itself; sub-contexts get organizationId from enrichment.
  const organizationId = item.entityType === 'organization' ? item.id : (item.organizationId ?? '');
  const queries = buildEntitySyncQueries({
    targetEntityId: item.id,
    targetEntityType: item.entityType,
    tenantId: item.tenantId,
    currentOrganizationId: organizationId,
    includeMemberQueries: offlineAccess,
  });

  await Promise.allSettled(
    queries.map(async (source) => {
      const options = { ...source, ...syncQueryConfig };
      const isInfinite = 'getNextPageParam' in options;
      return isInfinite
        ? // biome-ignore lint/suspicious/noExplicitAny: runtime check narrows type but TS can't infer it
          await queryClient.ensureInfiniteQueryData(options as any)
        : // biome-ignore lint/suspicious/noExplicitAny: runtime check narrows type but TS can't infer it
          await queryClient.ensureQueryData(options as any);
    }),
  );
}

/** Parent items come before their submenu items. */
function flattenMenuItems(menu: Record<string, UserMenuItem[]>): UserMenuItem[] {
  const items: UserMenuItem[] = [];

  function collect(menuItems: UserMenuItem[]) {
    for (const item of menuItems) {
      items.push(item);
      if (item.submenu) collect(item.submenu);
    }
  }

  for (const section of Object.values(menu)) {
    collect(section);
  }

  return items;
}
