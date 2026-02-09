import { appConfig } from 'shared';
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
  maxConsecutiveFailures?: number;
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
  private consecutiveFailures = 0;
  private circuitOpen = false;

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

    // Circuit breaker: stop if too many consecutive failures
    if (this.circuitOpen) {
      console.debug(`[${this.config.debugLabel}] Circuit breaker open, not attempting reconnect`);
      return;
    }

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

      // Reset circuit breaker on success
      this.consecutiveFailures = 0;

      if (!signal.aborted) this.connectSSE();
    } catch (error) {
      if (!signal.aborted) {
        this.consecutiveFailures++;
        const maxFailures = this.config.maxConsecutiveFailures ?? 3;
        const isPermanentError = this.isPermanentError(error);

        console.error(`[${debugLabel}] Catchup failed (${this.consecutiveFailures}/${maxFailures}):`, error);
        this.store.getState().setState('error');

        // Open circuit breaker for permanent errors or after max failures
        if (isPermanentError || this.consecutiveFailures >= maxFailures) {
          this.circuitOpen = true;
          console.warn(
            `[${debugLabel}] Circuit breaker opened: ${isPermanentError ? 'permanent error detected' : `${maxFailures} consecutive failures`}`,
          );
          return;
        }

        this.scheduleReconnect();
      }
    }
  }

  /** Check if an error is permanent (no point retrying). */
  private isPermanentError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status;
      // 401 Unauthorized, 403 Forbidden - auth/permission issues won't resolve with retry
      return status === 401 || status === 403;
    }
    // Check error message for known permanent error patterns
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('Access denied') || message.includes('Unauthorized');
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
      // Reset failure count on successful connection
      this.consecutiveFailures = 0;
      this.store.getState().setState('live');
    });

    eventSource.addEventListener('ping', () => {});

    eventSource.onerror = () => {
      this.consecutiveFailures++;
      const maxFailures = this.config.maxConsecutiveFailures ?? 3;
      console.debug(`[${debugLabel}] SSE error (${this.consecutiveFailures}/${maxFailures})`);

      this.store.getState().setState('error');
      eventSource.close();
      this.eventSource = null;

      if (this.consecutiveFailures >= maxFailures) {
        this.circuitOpen = true;
        console.warn(`[${debugLabel}] Circuit breaker opened: ${maxFailures} consecutive SSE failures`);
        return;
      }

      this.scheduleReconnect();
    };

    this.eventSource = eventSource;
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout || this.circuitOpen) return;
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

  /** Reset circuit breaker and failure count. Call when auth state changes. */
  resetCircuitBreaker() {
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
  }

  reconnect() {
    this.resetCircuitBreaker();
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
