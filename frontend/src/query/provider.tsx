import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState } from 'react';
import { appConfig } from 'shared';
import { downloadService } from '~/modules/attachment/download-service';
import { uploadService } from '~/modules/attachment/upload-service';
import { initContextEntityEnrichment } from '~/query/enrichment/init';
import { initMutationDefaults } from '~/query/mutation-registry';
import '~/modules/attachment/query';
import '~/modules/page/query';
import { cleanupOrphanedSessions, persister, sessionPersister } from '~/query/persister';
import { markCacheRestored, queryClient, silentRevalidateOnReconnect, updateStaleTime } from '~/query/query-client';
import { waitForActiveCatchup } from '~/query/realtime/stream-store';
import { useTabCoordinatorStore } from '~/query/realtime/tab-coordinator';
import { useUIStore } from '~/store/ui';

/**
 * Initialize mutation defaults BEFORE any cache restoration.
 * This registers mutationFn for each entity type so that paused mutations
 * can resume after page reload (mutationFn cannot be serialized to IndexedDB).
 *
 * NOTE: Query modules (~/modules/..../query) must be imported AFTER mutation-registry
 * as they call addMutationRegistrar() at module load time.
 */
initMutationDefaults(queryClient);

/**
 * Init context entity enrichment — guarded to prevent duplicate subscribers during HMR.
 */
let unsubscribeEnrichment = initContextEntityEnrichment();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeEnrichment();
  });
}

/**
 * Start offline services for background blob caching and upload sync.
 */
downloadService.start();
uploadService.start();

/**
 * QueryClientProvider wrapper handling cache persistence and offline capabilities.
 * Uses session or IndexedDB persister based on offlineAccess setting.
 * Only leader tab persists mutations in app routes to prevent cross-tab conflicts.
 */
export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const { offlineAccess, toggleOfflineAccess } = useUIStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isLeader = useTabCoordinatorStore((state) => state.isLeader);
  const isReady = useTabCoordinatorStore((state) => state.isReady);
  const isActive = useTabCoordinatorStore((state) => state.isActive);

  // Disable offline access if PWA is not enabled in the config
  if (!appConfig.has.pwa && offlineAccess) toggleOfflineAccess();

  // Clean up orphaned session-scoped IndexedDB entries on mount (fire-and-forget)
  useEffect(() => {
    cleanupOrphanedSessions();
  }, []);

  // Select persister based on offline access mode
  // - offlineAccess: IndexedDB (survives browser restart)
  // - session: sessionStorage (survives refresh, cleared on tab close)
  const activePersister = offlineAccess ? persister : sessionPersister;

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
        markCacheRestored();
        // Wait for stream catchup to complete before resuming paused mutations.
        // This ensures the cache has fresh data (and fresh stx versions) so replayed
        // mutations don't send stale lastReadVersion values causing avoidable 409s.
        waitForActiveCatchup().then(() => {
          queryClient.resumePausedMutations().then(() => {
            // Only invalidate queries if we're in offline mode (IDB persister)
            // Session mode doesn't need aggressive revalidation
            if (offlineAccess) {
              queryClient.invalidateQueries();
            }
          });
        });
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
