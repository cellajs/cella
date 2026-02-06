import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useMemo, useState } from 'react';
import { appConfig } from 'shared';
import { downloadService } from '~/modules/attachment/download-service';
import { uploadService } from '~/modules/attachment/upload-service';
import type { UserMenuItem } from '~/modules/me/types';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { entityToPrefetchQueries } from '~/offline-config';
import { setupMembershipEnrichment } from '~/query/membership-enrichment';
import { initMutationDefaults } from '~/query/mutation-registry';
// Import query modules AFTER mutation-registry to ensure registrars is initialized.
// These modules call addMutationRegistrar() at module load time.
import '~/modules/attachment/query';
import '~/modules/page/query';
import { persister } from '~/query/persister';
import { queryClient, silentRevalidateOnReconnect, updateStaleTime } from '~/query/query-client';
import { useTabCoordinatorStore } from '~/query/realtime/tab-coordinator';
import { sessionPersister } from '~/query/session-persister';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

// Initialize mutation defaults BEFORE any cache restoration.
// This registers mutationFn for each entity type so that paused mutations
// can resume after page reload (mutationFn cannot be serialized to IndexedDB).
initMutationDefaults(queryClient);

// Setup membership enrichment to auto-attach membership data to context entities
setupMembershipEnrichment();

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
 * QueryClientProvider wrapper handling cache persistence and offline capabilities.
 * Uses session or IndexedDB persister based on offlineAccess setting.
 * Only leader tab persists mutations in app routes to prevent cross-tab conflicts.
 */
export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUserStore();
  const { offlineAccess, toggleOfflineAccess } = useUIStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isLeader = useTabCoordinatorStore((state) => state.isLeader);
  const isReady = useTabCoordinatorStore((state) => state.isReady);
  const isActive = useTabCoordinatorStore((state) => state.isActive);

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
            (source) => {
              const options = { ...source, ...offlineQueryConfig };
              // Use ensureInfiniteQueryData for infinite queries (have getNextPageParam)
              if ('getNextPageParam' in options) return queryClient.ensureInfiniteQueryData(options);
              return queryClient.ensureQueryData(options);
            },
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
          // Public routes (!isActive): always persist. App routes: only leader persists after ready.
          shouldDehydrateMutation: () => !isActive || (isReady && isLeader),
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
