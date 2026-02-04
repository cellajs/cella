import { appConfig } from 'config';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { PublicStreamActivity, StreamNotification } from '~/api.gen';
import { getAppStream, publicStream } from '~/api.gen';
import { isDebugMode } from '~/env';
import { pageQueryKeys } from '~/modules/page/query';
import { queryClient } from '~/query/query-client';
import { useSyncStore } from '~/store/sync';
import { handleAppStreamNotification } from './app-stream-handler';
import { processCatchupBatch } from './catchup-processor';
import { handlePublicStreamMessage } from './public-stream-handler';
import { broadcastNotification, initTabCoordinator, isLeader, onNotification } from './tab-coordinator';
import type { AppStreamNotification, StreamState } from './types';

interface StreamConfig {
  debugLabel: string;
  endpoint: string;
  withCredentials: boolean;
  useTabCoordination: boolean;
  fetchCatchup: (offset: string | null) => Promise<{ activities: unknown[]; cursor: string | null }>;
  processNotification: (notification: unknown) => void;
  processCatchupBatch?: (activities: unknown[], options: { lastSyncAt: string | null }) => void;
  invalidateOnReconnect?: boolean;
}

interface StreamStoreState {
  state: StreamState;
  cursor: string | null;
  isFirstConnect: boolean;
}

interface StreamStoreActions {
  setState: (state: StreamState) => void;
  setCursor: (cursor: string | null) => void;
  setIsFirstConnect: (isFirst: boolean) => void;
  reset: () => void;
}

type StreamStore = StreamStoreState & StreamStoreActions;

function createStreamStore(name: string) {
  return create<StreamStore>()(
    devtools(
      (set) => ({
        state: 'disconnected',
        cursor: null,
        isFirstConnect: true,
        setState: (state) => set({ state }),
        setCursor: (cursor) => set({ cursor }),
        setIsFirstConnect: (isFirst) => set({ isFirstConnect: isFirst }),
        reset: () => set({ state: 'disconnected', cursor: null, isFirstConnect: true }),
      }),
      { name, enabled: isDebugMode },
    ),
  );
}

/** Manages SSE connection lifecycle with Zustand store for state. */
class StreamManager {
  private config: StreamConfig;
  private store: ReturnType<typeof createStreamStore>;
  private eventSource: EventSource | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private broadcastCleanup: (() => void) | null = null;
  private abortController: AbortController | null = null;

  constructor(config: StreamConfig, store: ReturnType<typeof createStreamStore>) {
    this.config = config;
    this.store = store;
  }

  get useStore() {
    return this.store;
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  /** Connect to stream (two-phase: catchup → live SSE). */
  async connect() {
    const { state } = this.store.getState();
    if (state === 'catching-up' || state === 'connecting' || state === 'live') return;

    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const { debugLabel, useTabCoordination } = this.config;

    try {
      if (useTabCoordination) {
        await initTabCoordinator();
        if (signal.aborted) return;

        this.broadcastCleanup?.();
        this.broadcastCleanup = onNotification((notification) => {
          if (!isLeader()) this.config.processNotification(notification);
        });

        if (!isLeader()) {
          console.debug(`[${debugLabel}] Not leader, listening to broadcasts only`);
          this.store.getState().setState('live');
          return;
        }
      }

      // Phase 1: Fetch catchup as JSON batch
      this.store.getState().setState('catching-up');

      const currentCursor = useTabCoordination ? useSyncStore.getState().cursor : this.store.getState().cursor;
      const lastSyncAt = useTabCoordination ? useSyncStore.getState().lastSyncAt : null;

      console.debug(`[${debugLabel}] Fetching catchup from offset: ${currentCursor ?? 'null'}`);
      const { activities, cursor: newCursor } = await this.config.fetchCatchup(currentCursor);
      if (signal.aborted) return;

      if (activities.length > 0) {
        console.debug(`[${debugLabel}] Processing ${activities.length} catchup activities`);
        if (this.config.processCatchupBatch) {
          this.config.processCatchupBatch(activities, { lastSyncAt });
        } else {
          for (const activity of activities) this.config.processNotification(activity);
        }
      }

      if (newCursor) {
        this.store.getState().setCursor(newCursor);
        if (useTabCoordination) {
          useSyncStore.getState().setCursor(newCursor);
          useSyncStore.getState().setLastSyncAt(new Date().toISOString());
        }
      }

      const { isFirstConnect } = this.store.getState();
      if (!isFirstConnect && this.config.invalidateOnReconnect) {
        console.debug(`[${debugLabel}] Invalidating list for modifiedAfter refetch`);
        queryClient.invalidateQueries({ queryKey: pageQueryKeys.list.base });
      }
      this.store.getState().setIsFirstConnect(false);

      console.debug(`[${debugLabel}] Catchup complete, cursor: ${newCursor}`);

      if (!signal.aborted) this.connectSSE();
    } catch (error) {
      if (!signal.aborted) {
        console.error(`[${debugLabel}] Catchup failed:`, error);
        this.store.getState().setState('error');
        this.scheduleReconnect();
      }
    }
  }

  private connectSSE() {
    const { debugLabel, endpoint, withCredentials, useTabCoordination } = this.config;

    const sseUrl = new URL(endpoint);
    sseUrl.searchParams.set('live', 'sse');
    sseUrl.searchParams.set('offset', 'now');

    this.store.getState().setState('connecting');
    const eventSource = new EventSource(sseUrl.toString(), { withCredentials });

    eventSource.onopen = () => {
      console.debug(`[${debugLabel}] SSE connected, waiting for offset...`);
    };

    eventSource.addEventListener('change', (e) => {
      try {
        const notification = JSON.parse(e.data);
        const eventId = e.lastEventId || undefined;

        if (eventId) {
          this.store.getState().setCursor(eventId);
          if (useTabCoordination) useSyncStore.getState().setCursor(eventId);
        }

        if (useTabCoordination && isLeader()) broadcastNotification(notification, 'user');
        this.config.processNotification(notification);
      } catch (error) {
        console.debug(`[${debugLabel}] Failed to parse message:`, error);
      }
    });

    eventSource.addEventListener('offset', (e) => {
      console.debug(`[${debugLabel}] SSE offset received: ${e.data}`);
      if (e.data) {
        this.store.getState().setCursor(e.data);
        if (useTabCoordination) useSyncStore.getState().setCursor(e.data);
      }
      this.store.getState().setState('live');
    });

    eventSource.addEventListener('ping', () => {});

    eventSource.onerror = () => {
      this.store.getState().setState('error');
      eventSource.close();
      this.eventSource = null;
      this.scheduleReconnect();
    };

    this.eventSource = eventSource;
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 5000);
  }

  disconnect() {
    this.abortController?.abort();
    this.abortController = null;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.broadcastCleanup?.();
    this.broadcastCleanup = null;
    this.store.getState().setState('disconnected');
  }

  reconnect() {
    this.disconnect();
    this.connect();
  }
}

// Public Stream

const publicStreamStore = createStreamStore('public-stream');

const publicStreamConfig: StreamConfig = {
  debugLabel: 'PublicStream',
  endpoint: `${appConfig.backendUrl}/entities/public/stream`,
  withCredentials: false,
  useTabCoordination: false,
  invalidateOnReconnect: true,
  fetchCatchup: async (offset) => {
    const response = await publicStream({ query: { offset: offset ?? undefined } });
    return { activities: (response.activities ?? []) as PublicStreamActivity[], cursor: response.cursor ?? null };
  },
  processNotification: (notification) => handlePublicStreamMessage(notification as PublicStreamActivity),
};

export const publicStreamManager = new StreamManager(publicStreamConfig, publicStreamStore);
export const usePublicStreamStore = publicStreamStore;

// App Stream

const appStreamStore = createStreamStore('app-stream');

const appStreamConfig: StreamConfig = {
  debugLabel: 'AppStream',
  endpoint: `${appConfig.backendUrl}/entities/app/stream`,
  withCredentials: true,
  useTabCoordination: true,
  invalidateOnReconnect: false,
  fetchCatchup: async (offset) => {
    const response = await getAppStream({ query: { offset: offset ?? undefined } });
    return { activities: (response.activities ?? []) as StreamNotification[], cursor: response.cursor ?? null };
  },
  processNotification: (notification) => handleAppStreamNotification(notification as AppStreamNotification),
  processCatchupBatch: (activities, options) => processCatchupBatch(activities as AppStreamNotification[], options),
};

export const appStreamManager = new StreamManager(appStreamConfig, appStreamStore);
export const useAppStreamStore = appStreamStore;
