import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState } from 'react';
import { appConfig } from 'shared';
import { downloadService } from '~/modules/attachment/offline/download-service';
import { uploadService } from '~/modules/attachment/offline/upload-service';
import { useUIStore } from '~/modules/ui/ui-store';
import { initChannelEnrichment } from '~/query/enrichment/init-enrichment';
// Side-effect import: starts the auth-driven localUserDb lifecycle and eager kv hydration before any route beforeLoad runs.
import '~/query/local-user-storage';
import { initMutationDefaults } from '~/query/mutation-registry';
import { cleanupOrphanedSessions, persister, sessionPersister } from '~/query/persister';
import { markCacheRestored, queryClient, silentRevalidateOnReconnect, updateStaleTime } from '~/query/query-client';
import { waitForActiveCatchup } from '~/query/realtime/stream-store';

// Runs before cache restoration: stores the queryClient so entity modules self-register their mutationFn via addMutationRegistrar() on load.
initMutationDefaults(queryClient);

const unsubscribeEnrichment = initChannelEnrichment();

// HMR cleanup: re-evaluation would otherwise leave duplicate enrichment subscribers.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeEnrichment();
  });
}

/** Adds cache persistence and offline support: the persister is session or IndexedDB per offlineAccess. */
export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const { offlineAccess, toggleOfflineAccess } = useUIStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (!appConfig.has.pwa && offlineAccess) toggleOfflineAccess();
  }, [offlineAccess, toggleOfflineAccess]);

  useEffect(() => {
    cleanupOrphanedSessions();
  }, []);

  // Started at mount, not module eval, to avoid a circular-import TDZ during HMR: provider -> download-service -> attachment/query -> realtime -> query/index -> provider.
  useEffect(() => {
    downloadService.start();
    uploadService.start();
    return () => {
      downloadService.stop();
      uploadService.stop();
    };
  }, []);

  // offlineAccess persists to IndexedDB and survives restart; the session persister survives refresh and is reclaimed after the tab closes.
  const activePersister = offlineAccess ? persister : sessionPersister;

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

    updateStaleTime(true, navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      updateStaleTime(false, true);
    };
  }, [offlineAccess]);

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
          // Only paused mutations persist: active ones may hold non-cloneable streaming data.
          shouldDehydrateMutation: (mutation) => mutation.state.isPaused,
          shouldDehydrateQuery: (query) => query.state.status === 'success' && query.meta?.persist !== false,
        },
      }}
      onSuccess={() => {
        markCacheRestored();
        // Paused mutations resume after catchup so replays read reconciled data; no blanket invalidation, since that would refetch every cached list on startup.
        waitForActiveCatchup().then(() => queryClient.resumePausedMutations());
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
