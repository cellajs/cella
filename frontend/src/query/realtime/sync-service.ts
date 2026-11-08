import type { FetchInfiniteQueryOptions, FetchQueryOptions, QueryKey } from '@tanstack/react-query';
import { buildEntitySyncQueries } from '~/entity-sync-queries';
import { ApiError } from '~/lib/api';
import { msUntilBudget } from '~/lib/reported-budgets';
import type { UserMenuItem } from '~/modules/me/types';
import { productTypeOf } from '~/query/cache-migration';
import { queryClient } from '~/query/query-client';
import { isOpaqueScope } from '~/query/realtime/catchup-processor';
import { getRouteOrganizationId } from '~/query/realtime/sync-priority';
import { waitFor } from '~/utils/wait-for';

type SyncInfiniteCall = FetchInfiniteQueryOptions<unknown, ApiError, unknown, QueryKey, unknown>;
type SyncSingleCall = FetchQueryOptions<unknown, ApiError, unknown, QueryKey>;

const isInfiniteCall = (options: SyncInfiniteCall | SyncSingleCall): options is SyncInfiniteCall => 'getNextPageParam' in options;

/** The share of the read budget the warm-up leaves to what the user opens: below it, the warm-up waits for the next window. */
const userReadShare = 0.3;

const isRateLimited = (error: unknown): error is ApiError => error instanceof ApiError && error.status === 429;

/** Seeds offline caches once the stream is live: the current organization first, then the rest. `signal` cancels on unmount or retrigger. */
export async function runSyncService(signal: AbortSignal): Promise<void> {
  // Starts a second after the stream went live, behind the requests of the page itself.
  await waitFor(1000);
  if (signal.aborted) return;

  // Menu comes from already-cached entity lists; imported dynamically to avoid HMR coupling.
  const { getMenuData } = await import('~/modules/navigation/menu-sheet/helpers/get-menu-data');
  const menu = await getMenuData();
  if (signal.aborted) return;

  const allItems = flattenMenuItems(menu);
  if (allItems.length === 0) return;

  const routeOrganizationId = getRouteOrganizationId();

  const highPriority = allItems.filter((item) => item.membership.organizationId === routeOrganizationId);
  const lowPriority = allItems.filter((item) => item.membership.organizationId !== routeOrganizationId);

  for (const item of highPriority) {
    if (signal.aborted) return;
    await syncWithinBudget(item, signal);
  }

  for (const item of lowPriority) {
    if (signal.aborted) return;
    // Staggered, so the background seeding does not burst the server.
    await waitFor(500);
    await syncWithinBudget(item, signal);
  }

  console.debug(`[SyncService] Complete: ${highPriority.length} high-priority, ${lowPriority.length} low-priority`);
}

/**
 * Syncs one item while the read budget leaves the user their share, else once its window ends. A read refused all the
 * same, as other tabs and devices spend the budget too, waits out its `retryAfter` and the item is tried once more.
 */
async function syncWithinBudget(item: UserMenuItem, signal: AbortSignal): Promise<void> {
  let refusedFor = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = Math.max(msUntilBudget('read', userReadShare), refusedFor * 1000);
    if (wait) console.debug(`[SyncService] Waiting ${Math.ceil(wait / 1000)}s for the read budget`);
    await waitFor(wait);
    if (signal.aborted) return;
    refusedFor = await syncMenuItem(item);
    if (!refusedFor) return;
  }
}

/**
 * Seeds the offline cache for one menu item. A product list reads on its own stale time: it fetches when it is cold or
 * marked for a refetch, and a fresh one is left to catchup. Any other query, and a product list of an `opaque` scope,
 * reads with `staleTime: 'static'`, which fetches only a cold entry: a list that goes stale by time, such as the members
 * list, or one every catchup marks would otherwise fetch again on every stream-live event.
 * @returns The seconds a rate limit asked to wait, when it refused a read; else 0.
 */
async function syncMenuItem(item: UserMenuItem): Promise<number> {
  if (item.membership.archived) return 0;

  const { organizationId } = item.membership;
  const queries = buildEntitySyncQueries({
    targetEntityId: item.id,
    targetEntityType: item.entityType,
    tenantId: item.tenantId,
    currentOrganizationId: organizationId,
  });

  const results = await Promise.allSettled(
    queries.map(async (source) => {
      // The queries differ in key and data types, which no single options type holds: one cast to the call shapes, the `in` check picks the call.
      const productType = productTypeOf(source.queryKey);
      const ownFreshness = productType && !isOpaqueScope(organizationId, productType);
      const options = (ownFreshness ? source : { ...source, staleTime: 'static' }) as SyncInfiniteCall | SyncSingleCall;
      return isInfiniteCall(options) ? await queryClient.infiniteQuery(options) : await queryClient.query(options);
    }),
  );

  for (const result of results) if (result.status === 'rejected' && isRateLimited(result.reason)) return Number(result.reason.retryAfter) || 1;
  return 0;
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
