import type { InfiniteQueryExecuteOptions, QueryExecuteOptions, QueryKey } from '@tanstack/react-query';
import { buildEntitySyncQueries } from '~/entity-sync-queries';
import { type ApiError, isRateLimited } from '~/lib/api';
import { msUntilBudget, userReadShare } from '~/lib/reported-budgets';
import { canAccess, currentAccess } from '~/modules/entities/use-can';
import type { UserMenuItem } from '~/modules/me/types';
import { memberQueryKeys } from '~/modules/memberships/query';
import { productTypeOf } from '~/query/cache-migration';
import { queryClient } from '~/query/query-client';
import { isOpaqueScope } from '~/query/realtime/catchup-processor';
import { getRouteOrganizationId } from '~/query/realtime/sync-priority';
import { syncStore } from '~/query/realtime/sync-store';
import { waitFor, whenVisible } from '~/utils/wait-for';

type SyncInfiniteCall = InfiniteQueryExecuteOptions<unknown, ApiError, unknown, QueryKey, unknown>;
type SyncSingleCall = QueryExecuteOptions<unknown, ApiError, unknown, unknown, QueryKey>;

const isInfiniteCall = (options: SyncInfiniteCall | SyncSingleCall): options is SyncInfiniteCall => 'getNextPageParam' in options;

/** Seeds offline caches once the stream is live: the current organization first, then the rest. `signal` cancels on unmount or retrigger. */
export async function runSyncService(signal: AbortSignal): Promise<void> {
  // Starts a second after the stream went live, behind the requests of the page itself. After a start over it waits for
  // the refetch's moment, this client's slot in the audience's window, and for the tab to be visible: a hidden tab's
  // fill reads nothing until the tab is shown.
  const { refetchDueAt } = syncStore.getState();
  await waitFor(Math.max(1000, (refetchDueAt ?? 0) - Date.now()));
  await whenVisible();
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
 * same, as other tabs and devices spend the budget too, books the budget as spent until its `Retry-After`, and the item
 * is tried once more after that.
 */
async function syncWithinBudget(item: UserMenuItem, signal: AbortSignal): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = msUntilBudget('read', userReadShare);
    if (wait) console.debug(`[SyncService] Waiting ${Math.ceil(wait / 1000)}s for the read budget`);
    await waitFor(wait);
    if (signal.aborted) return;
    if (!(await syncMenuItem(item))) return;
  }
}

/** A members list (`['member', 'list', …]`) or an invitations list (the same behind `'invites'`): a channel's people. */
const listsPeople = (key: QueryKey) => [0, 1].some((at) => memberQueryKeys.list.base.every((part, i) => key[at + i] === part));

/**
 * Seeds the offline cache for one menu item. A product list reads on its own stale time: it fetches when it is cold or
 * marked for a refetch, and a fresh one is left to catchup. Any other query, and a product list of an `opaque` scope,
 * reads with `staleTime: 'static'`, which fetches only a cold entry: a list that goes stale by time, such as the members
 * list, or one every catchup marks would otherwise fetch again on every stream-live event.
 * @returns Whether a rate limit refused a read.
 */
async function syncMenuItem(item: UserMenuItem): Promise<boolean> {
  if (item.membership.hidden) return false;

  const { organizationId } = item.membership;
  // A channel's members and invitations answer 403 to a user whose roles read none of its people.
  const access = await currentAccess();
  const readsPeople = !access || canAccess(access, 'read', 'user', item);
  const queries = buildEntitySyncQueries({
    targetEntityId: item.id,
    targetEntityType: item.entityType,
    tenantId: item.tenantId,
    currentOrganizationId: organizationId,
  }).filter((source) => readsPeople || !listsPeople(source.queryKey));

  const results = await Promise.allSettled(
    queries.map(async (source) => {
      // The queries differ in key and data types, which no single options type holds: one cast to the call shapes, the `in` check picks the call.
      const productType = productTypeOf(source.queryKey);
      const ownFreshness = productType && !isOpaqueScope(organizationId, productType);
      const options = (ownFreshness ? source : { ...source, staleTime: 'static' }) as SyncInfiniteCall | SyncSingleCall;
      return isInfiniteCall(options) ? await queryClient.infiniteQuery(options) : await queryClient.query(options);
    }),
  );

  return results.some((result) => result.status === 'rejected' && isRateLimited(result.reason));
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

  for (const section of Object.values(menu)) collect(section);

  return items;
}
