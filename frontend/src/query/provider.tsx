import { QueryClientProvider as BaseQueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { appConfig } from 'config';
import { useEffect } from 'react';
import type { UserMenuItem } from '~/modules/me/types';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { entityToPrefetchQueries } from '~/offline-config';
import { useOfflineManager } from '~/query/offline-manager';
import { persister } from '~/query/persister';
import { queryClient } from '~/query/query-client';
import { waitFor } from '~/query/utils';
import { prefetchQuery } from '~/query/utils/prefetch-query';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

export const offlineQueryConfig = {
  gcTime: 24 * 60 * 60 * 1000, // Cache expiration time: 24 hours
  meta: {
    offlinePrefetch: true,
  },
};

/**
 * QueryClientProvider wrapper that handles two modes of operation:
 *
 * 1. **Standard Mode** (offlineAccess = false):
 *    - Uses the base TanStack Query provider
 *    - No cache persistence or prefetching
 *
 * 2. **Offline Mode** (offlineAccess = true):
 *    - Uses PersistQueryClientProvider to persist cache to IndexedDB
 *    - Automatically prefetches content for offline availability
 *
 * ## Offline Prefetch Strategy
 *
 * The prefetch logic operates in phases:
 *
 * 1. **Menu structure**: Already cached from entity list queries (organizations, etc.)
 *    via `getContextEntityTypeToListQueries()`. The menu is built from these entity
 *    lists using `buildMenu()`.
 *
 * 2. **Menu content**: This provider prefetches the *content within* each menu item:
 *    - For each menu item entity (e.g., organization), fetch related data like
 *      members, attachments, etc. as defined in `entityToPrefetchQueries()`
 *    - Recursively processes submenus to prefetch their content as well
 *    - Skips archived items to reduce unnecessary data transfer
 *    - Rate-limited with delays to avoid overloading the server
 *
 * The separation ensures efficient caching: menu entities themselves are already
 * available from the entity list queries used to build the menu, while this provider
 * focuses on prefetching the detailed content users will need when navigating.
 */
export const QueryClientProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useUserStore();
  const { offlineAccess, toggleOfflineAccess } = useUIStore();

  // Disable offline access if PWA is not enabled in the config
  if (!appConfig.has.pwa && offlineAccess) toggleOfflineAccess();

  // Initialize offline manager for network status tracking and executor coordination
  // This handles online/offline events and notifies executors when back online
  const { isOnline, pendingCount } = useOfflineManager(offlineAccess);

  // Log offline status changes for debugging
  useEffect(() => {
    if (!offlineAccess) return;
    console.info(`[Offline] Network: ${isOnline ? 'online' : 'offline'}, Pending mutations: ${pendingCount}`);
  }, [offlineAccess, isOnline, pendingCount]);

  useEffect(() => {
    // Exit early if offline access is disabled or no stored user is available
    if (!offlineAccess || !user) return;

    let isCancelled = false; // to handle the cancellation

    (async () => {
      await waitFor(1000); // Avoid overloading server with requests
      if (isCancelled) return; // If request was aborted, exit early

      // Get menu from already-cached entity lists
      const menu = await getMenuData();

      // Recursive function to prefetch content data based on menu items
      const prefetchContentData = async (items: UserMenuItem[]) => {
        for (const item of items) {
          if (isCancelled) return; // Check for abortion in each loop
          if (item.membership.archived) continue; // Skip archived items

          // Prefetch data (e.g., members as a react query, attachments as a collection, etc.)
          const prefetchPromises = entityToPrefetchQueries(item.id, item.entityType, item.organizationId).map(
            (source) =>
              typeof source === 'function'
                ? source()
                : prefetchQuery({
                    ...source,
                    ...offlineQueryConfig,
                  }),
          );
          await Promise.allSettled(prefetchPromises);

          await waitFor(500); // Avoid overloading server

          // Recursively prefetch submenu items if they exist
          if (item.submenu) await prefetchContentData(item.submenu);
        }
      };

      // Start prefetching content data for each menu section
      Object.values(menu).map(prefetchContentData);
    })();

    // Cleanup function to abort prefetch if component is unmounted
    return () => {
      isCancelled = true;
    };
  }, [offlineAccess, user]);

  if (!offlineAccess) return <BaseQueryClientProvider client={queryClient}>{children}</BaseQueryClientProvider>;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
      onSuccess={() => {
        // After successful cache restoration, resume paused mutations and invalidate queries
        queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries());
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
