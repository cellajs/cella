import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { type ReactNode, useEffect } from 'react';
import { downloadService } from '~/modules/attachment/offline/download-service';
import { startYjsStore } from '~/modules/common/blocknote/yjs-store';
import { initChannelEnrichment } from '~/query/enrichment/init-channel-enrichment';
// Side-effect import: starts the auth-driven localUserDb lifecycle and eager kv hydration before any route beforeLoad runs.
import '~/query/local-user-storage';
import { getLocalUserDb, subscribeLocalUserChange } from '~/query/local-user-db';
import { startConnectivity } from '~/query/offline/connectivity';
import { persistOptions } from '~/query/persister';
import { markCacheRestored, queryClient } from '~/query/query-client';
import { resumeRestoredMutations } from '~/query/realtime/stream-manager';
import { cancelIdle, scheduleIdle } from '~/utils/schedule-idle';

// The React Compiler cannot lower an `import()` inside a component, so the dynamic import lives at module level
const loadUploadService = () => import('~/modules/attachment/offline/upload-service');

/** Idle scheduling with a ceiling, so a browser that never goes idle still starts the service. */
const idleTimeoutMs = 5000;

/**
 * Warns about restored mutations that hold no `mutationFn`: their module set its defaults after the restore, so their
 * replay fails. Runs after the restore, before resuming.
 */
function warnMutationsWithoutDefaults(): void {
  const keys = queryClient
    .getMutationCache()
    .getAll()
    .filter((mutation) => mutation.state.isPaused && !mutation.options.mutationFn)
    .map((mutation) => mutation.options.mutationKey);
  if (keys.length === 0) return;
  console.warn('[QueryPersister] Restored mutations without a mutationFn; import their query.ts from the <name>-module.ts file', keys);
}

const unsubscribeEnrichment = initChannelEnrichment();

// HMR cleanup: re-evaluation would otherwise leave duplicate enrichment subscribers.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeEnrichment();
  });
}

/** Provides the query client with its persisted cache, and starts the services that work from it. */
export function PersistedQueryProvider({ children }: { children: ReactNode }) {
  useEffect(() => startYjsStore(), []);

  useEffect(() => {
    downloadService.start();

    // Waits for a user's database, then for idle: a visitor has nothing to upload, nothing can be queued during the first
    // paint, and the import pulls @uppy/core with it, which on a slow link competes with the chunks the first render needs.
    let service: { stop: () => void } | undefined;
    let idle: number | undefined;
    let cancelled = false;
    const scheduleUploads = () => {
      if (idle !== undefined || !getLocalUserDb()) return;
      idle = scheduleIdle(() => {
        loadUploadService().then(({ uploadService }) => {
          if (cancelled) return;
          service = uploadService;
          uploadService.start();
        });
      }, idleTimeoutMs);
    };
    scheduleUploads();
    const unsubscribeLocalUser = subscribeLocalUserChange(scheduleUploads);

    return () => {
      cancelled = true;
      unsubscribeLocalUser();
      if (idle !== undefined) cancelIdle(idle);
      downloadService.stop();
      service?.stop();
    };
  }, []);

  useEffect(() => startConnectivity(), []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        markCacheRestored();
        warnMutationsWithoutDefaults();
        resumeRestoredMutations();
      }}
      // A failed restore releases the routes that wait for it too, and the queue it hydrated before the failure replays after catchup.
      onError={() => {
        markCacheRestored();
        resumeRestoredMutations();
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
