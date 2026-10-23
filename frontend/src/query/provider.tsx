import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect } from 'react';
import { appConfig } from 'shared';
import { downloadService } from '~/modules/attachment/offline/download-service';
import { startYjsStore } from '~/modules/common/blocknote/yjs-store';
import { useUIStore } from '~/modules/ui/ui-store';
import { initChannelEnrichment } from '~/query/enrichment/init-enrichment';
// Side-effect import: starts the auth-driven localUserDb lifecycle and eager kv hydration before any route beforeLoad runs.
import '~/query/local-user-storage';
import { initMutationDefaults, warnMutationsWithoutDefaults } from '~/query/mutation-registry';
import { cleanupOrphanedSessions, persistOptions } from '~/query/persister';
import { markCacheRestored, markReplayingMutations, queryClient, silentRevalidateOnReconnect, updateStaleTime } from '~/query/query-client';
import { waitForActiveCatchup } from '~/query/realtime/stream-store';
import { cancelIdle, scheduleIdle } from '~/utils/schedule-idle';

/** Idle scheduling with a ceiling, so a browser that never goes idle still starts the service. */
const idleTimeoutMs = 5000;

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
  const offlineAccess = useUIStore((state) => state.offlineAccess);
  const toggleOfflineAccess = useUIStore((state) => state.toggleOfflineAccess);

  useEffect(() => {
    if (!appConfig.has.pwa && offlineAccess) toggleOfflineAccess();
  }, [offlineAccess, toggleOfflineAccess]);

  useEffect(() => {
    cleanupOrphanedSessions();
  }, []);

  // Stored collaborative documents: evicted past their limits, and unsynced ones uploaded by the leader tab.
  useEffect(() => startYjsStore(), []);

  // Started at mount, not module eval, to avoid a circular-import TDZ during HMR: provider -> download-service -> attachment/query -> realtime -> query/index -> provider.
  useEffect(() => {
    downloadService.start();

    // Waits for idle: nothing can be queued for upload during the first paint, and the import pulls
    // @uppy/core with it, which on a slow link competes with the chunks the first render needs.
    let service: { stop: () => void } | undefined;
    let cancelled = false;
    const idle = scheduleIdle(() => {
      import('~/modules/attachment/offline/upload-service').then((m) => {
        if (cancelled) return;
        service = m.uploadService;
        m.uploadService.start();
      });
    }, idleTimeoutMs);

    return () => {
      cancelled = true;
      cancelIdle(idle);
      downloadService.stop();
      service?.stop();
    };
  }, []);

  useEffect(() => {
    if (!offlineAccess) return;

    const applyNetwork = (online: boolean) => {
      console.info(`[Offline] Network: ${online ? 'online' : 'offline'}`);
      updateStaleTime(true, online);
    };
    const handleOnline = () => {
      applyNetwork(true);
      silentRevalidateOnReconnect();
    };
    const handleOffline = () => applyNetwork(false);

    applyNetwork(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      updateStaleTime(false, true);
    };
  }, [offlineAccess]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        markCacheRestored();
        warnMutationsWithoutDefaults(queryClient);
        // Paused mutations resume after catchup so replays read reconciled data; no blanket invalidation, since that would refetch every cached list on startup.
        waitForActiveCatchup().then(() => {
          markReplayingMutations();
          return queryClient.resumePausedMutations();
        });
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
