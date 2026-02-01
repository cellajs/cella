import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { appConfig } from 'config';
import { useEffect, useMemo, useState } from 'react';
import { downloadService } from '~/modules/attachment/download-service';
import { uploadService } from '~/modules/attachment/upload-service';
import type { UserMenuItem } from '~/modules/me/types';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { entityToPrefetchQueries } from '~/offline-config';
import { prefetchQuery } from '~/query/basic';
import { initMutationDefaults } from '~/query/mutation-registry';
// Import query modules AFTER mutation-registry to ensure registrars is initialized.
// These modules call addMutationRegistrar() at module load time.
import '~/modules/attachment/query';
import '~/modules/page/query';
import { persister } from '~/query/persister';
import { queryClient, silentRevalidateOnReconnect, updateStaleTime } from '~/query/query-client';
import { initTabCoordinator, useTabCoordinatorStore } from '~/query/realtime/tab-coordinator';
import { sessionPersister } from '~/query/session-persister';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

// Initialize mutation defaults BEFORE any cache restoration.
// This registers mutationFn for each entity type so that paused mutations
// can resume after page reload (mutationFn cannot be serialized to IndexedDB).
initMutationDefaults(queryClient);

// Initialize tab coordinator early so we know leader status before persistence decisions.
// This is async but fast (uses Web Locks ifAvailable: true for quick determination).
initTabCoordinator();

// Start offline services for background blob caching and upload sync
downloadService.start();
uploadService.start();

/** Configuration for offline-capable queries. */
export const offlineQueryConfig = {
  gcTime: 24 * 60 * 60 * 1000, // Cache expiration time: 24 hours
  meta: {
    offlinePrefetch: true,
  },
};

/**
 * Wait for a given number of milliseconds.
 *
 * @param ms - Number of milliseconds to wait.
 * @returns Promise that resolves after the given number of milliseconds.
 */
export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * QueryClientProvider wrapper that handles cache persistence and offline capabilities.
 *
 * ## Persistence modes
 *
 * Both modes use PersistQueryClientProvider, but with different storage backends:
 *
 * 1. **Session Mode** (offlineAccess = false):
 *    - Uses sessionStorage persister (survives refresh, cleared on tab close)
 *    - No prefetching
 *
 * 2. **Offline Mode** (offlineAccess = true):
 *    - Uses IndexedDB persister (survives browser restart)
 *    - Automatically prefetches content for offline availability
 *
 * ## Mutation persistence (leader-only)
 *
 * To prevent cross-tab conflicts when persisting mutations:
 * - **Leader tab**: Persists mutations to storage (survives refresh)
 * - **Follower tabs**: Mutations stay in-memory only
 *
 * The tab coordinator uses Web Locks API to elect a single leader across tabs.
 * If the leader tab closes, a follower is promoted and takes over persistence.
 *
 * ## Offline prefetch strategy (offlineAccess = true only)
 *
 * The prefetch logic operates in phases:
 *
 * 1. **Menu structure**: Already cached from entity list queries
 * 2. **Menu content**: Prefetches content within each menu item
 */
export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUserStore();
  const { offlineAccess, toggleOfflineAccess } = useUIStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isLeader = useTabCoordinatorStore((state) => state.isLeader);

  // Disable offline access if PWA is not enabled in the config
  if (!appConfig.has.pwa && offlineAccess) toggleOfflineAccess();

  // Select persister based on offline access mode
  // - offlineAccess: IndexedDB (survives browser restart)
  // - session: sessionStorage (survives refresh, cleared on tab close)
  const activePersister = useMemo(() => (offlineAccess ? persister : sessionPersister), [offlineAccess]);

  // Track online/offline status and update staleTime accordingly
  useEffect(() => {
    if (!offlineAccess) return;

    const handleOnline = () => {
      setIsOnline(true);
      updateStaleTime(true, true);
      silentRevalidateOnReconnect();
    };
    const handleOffline = () => {
      setIsOnline(false);
      updateStaleTime(true, false);
    };

    // Set initial staleTime based on current network status
    updateStaleTime(true, navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      // Reset to default staleTime when offlineAccess is disabled
      updateStaleTime(false, true);
    };
  }, [offlineAccess]);

  // Log offline status changes for debugging
  useEffect(() => {
    if (!offlineAccess) return;
    console.info(`[Offline] Network: ${isOnline ? 'online' : 'offline'}`);
  }, [offlineAccess, isOnline]);

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
              prefetchQuery({
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

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: activePersister,
        dehydrateOptions: {
          // Only leader tab persists mutations to storage.
          // This prevents cross-tab conflicts when multiple tabs queue mutations.
          // Follower tabs keep mutations in-memory (work while tab is open).
          shouldDehydrateMutation: () => isLeader,
        },
      }}
      onSuccess={() => {
        // After successful cache restoration, resume any paused mutations and revalidate.
        queryClient.resumePausedMutations().then(() => {
          // Only invalidate queries if we're in offline mode (IDB persister)
          // Session mode doesn't need aggressive revalidation
          if (offlineAccess) {
            queryClient.invalidateQueries();
          }
        });
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
