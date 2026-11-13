import { QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClientSubscribe } from '@tanstack/react-query-persist-client';
import { type ReactNode, useEffect } from 'react';
import { downloadService } from '~/modules/attachment/offline/download-service';
import { startYjsStore } from '~/modules/common/blocknote/yjs-store';
import { initChannelEnrichment } from '~/query/enrichment/init-channel-enrichment';
// Side-effect import: binds the signed-in user's database, which rehydrates the kv stores and restores the query cache, before any route beforeLoad runs.
import '~/query/local-user-storage';
import { getLocalUserDb, subscribeLocalUserChange } from '~/query/local-user-db';
import { startConnectivity } from '~/query/offline/connectivity';
import { persistOptions } from '~/query/persister';
import { queryClient } from '~/query/query-client';
import { cancelIdle, scheduleIdle } from '~/utils/schedule-idle';

// The React Compiler cannot lower an `import()` inside a component, so the dynamic import lives at module level
const loadUploadService = () => import('~/modules/attachment/offline/upload-service');

/** Idle scheduling with a ceiling, so a browser that never goes idle still starts the service. */
const idleTimeoutMs = 5000;

const unsubscribeEnrichment = initChannelEnrichment();

// HMR cleanup: re-evaluation would otherwise leave duplicate enrichment subscribers.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeEnrichment();
  });
}

/** Provides the query client, saves its cache on every change, and starts the services that work from it. */
export function PersistedQueryProvider({ children }: { children: ReactNode }) {
  // The cache is restored where a user's database binds; a save before that restore completes writes nothing.
  useEffect(() => persistQueryClientSubscribe({ queryClient, ...persistOptions }), []);

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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
