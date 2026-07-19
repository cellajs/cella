import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState } from 'react';
import { appConfig } from 'shared';
import { downloadService } from '~/modules/attachment/offline/download-service';
import { uploadService } from '~/modules/attachment/offline/upload-service';
import { useUIStore } from '~/modules/ui/ui-store';
import { initChannelEntityEnrichment } from '~/query/enrichment/init-enrichment';
// Side-effect import: starts the auth-driven appdb lifecycle + eager kv hydration at root,
// before any route beforeLoad runs.
import '~/query/app-storage';
import { initMutationDefaults } from '~/query/mutation-registry';
import { cleanupOrphanedSessions, persister, sessionPersister } from '~/query/persister';
import { markCacheRestored, queryClient, silentRevalidateOnReconnect, updateStaleTime } from '~/query/query-client';
import { waitForActiveCatchup } from '~/query/realtime/stream-store';

/**
 * Init mutation defaults BEFORE cache restoration: stores the queryClient so entity modules can
 * self-register their mutationFn via addMutationRegistrar() on load (no explicit imports needed).
 */
initMutationDefaults(queryClient);

/**
 * Init channel entity enrichment, guarded to prevent duplicate subscribers during HMR.
 */
const unsubscribeEnrichment = initChannelEntityEnrichment();

/**
 * HMR cleanup: unsubscribe enrichment to prevent duplicates on re-evaluation.
 */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeEnrichment();
  });
}

/**
 * QueryClientProvider wrapper for cache persistence + offline. Persister is session or IndexedDB
 * per offlineAccess. In app routes only the leader tab persists mutations, to avoid cross-tab conflicts.
 */
export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const { offlineAccess, toggleOfflineAccess } = useUIStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Disable offline access if PWA is not enabled in the config
  useEffect(() => {
    if (!appConfig.has.pwa && offlineAccess) toggleOfflineAccess();
  }, [offlineAccess, toggleOfflineAccess]);

  // Clean up orphaned session-scoped IndexedDB entries on mount (fire-and-forget)
  useEffect(() => {
    cleanupOrphanedSessions();
  }, []);

  // Start offline services for background blob caching and upload sync.
  // Deferred to mount (not module-eval) to avoid a circular-import TDZ during HMR:
  // provider.tsx -> download-service -> attachment/query -> realtime -> query/index -> provider.tsx.
  useEffect(() => {
    downloadService.start();
    uploadService.start();
    return () => {
      downloadService.stop();
      uploadService.stop();
    };
  }, []);

  // Persister by mode: offlineAccess -> IndexedDB (survives restart); session -> sessionStorage
  // (survives refresh, cleared on tab close).
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
          // Every tab dehydrates ITS OWN paused mutations; the persister writes them to a
          // per-tab record, so tabs never overwrite each other's queues (the old leader-only
          // gate silently dropped a follower's paused work on refresh). Only paused mutations
          // are persisted; they're the offline replay queue. Active/streaming mutations (e.g.
          // AI chat SSE) can hold non-cloneable data (ReadableStream) and must be skipped.
          shouldDehydrateMutation: (mutation) => mutation.state.isPaused,
          shouldDehydrateQuery: (query) => query.state.status === 'success' && query.meta?.persist !== false,
        },
      }}
      onSuccess={() => {
        markCacheRestored();
        // Wait for stream catchup to complete before resuming paused mutations.
        // Wait until replayed mutations can use fresh cache data.
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
