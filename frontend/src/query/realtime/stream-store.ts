import { appConfig } from 'shared';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { StreamNotification } from '~/api.gen';
import { postAppCatchup, postPublicCatchup } from '~/api.gen';
import { isDebugMode } from '~/env';
import { useSyncStore } from '~/store/sync';
import { handleAppStreamNotification } from './app-stream-handler';
import { processAppCatchup, processPublicCatchup } from './catchup-processor';
import { handlePublicStreamNotification } from './public-stream-handler';
import {
  broadcastNotification,
  initTabCoordinator,
  isLeader,
  onNotification,
  useTabCoordinatorStore,
} from './tab-coordinator';
import type { AppStreamNotification, StreamState } from './types';

// Circuit breaker & reconnect constants
const MAX_FAILURES = 3;
const CIRCUIT_COOLDOWN_MS = 60_000;
const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_FACTOR = 2;
const HEALTH_URL = `${appConfig.backendUrl}/auth/health`;

interface StreamConfig {
  endpoint: string;
  withCredentials: boolean;
  useTabCoordination: boolean;
  /** Fetch catchup summary and process it. Returns the new cursor. */
  fetchAndProcessCatchup: (offset: string | null) => Promise<string | null>;
  /** Process a single live SSE notification. */
  processNotification: (notification: unknown) => void;
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
  private eventSource: EventSource | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private broadcastCleanup: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private circuitOpenedAt: number | null = null;
  private currentBackoff = INITIAL_BACKOFF_MS;
  private healthCheckInProgress = false;
  private visibilityHandler: (() => void) | null = null;
  private leaderUnsubscribe: (() => void) | null = null;

  readonly useStore: ReturnType<typeof createStreamStore>;

  constructor(name: string, config: StreamConfig) {
    this.config = config;
    this.useStore = createStreamStore(name);
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  /** Connect to stream (two-phase: catchup → live SSE). */
  async connect() {
    // Set up reconnect listeners (idempotent, cleaned up in disconnect)
    this.startVisibilityReconnect();
    this.startLeaderReconnect();

    const { state } = this.useStore.getState();
    if (state === 'catching-up' || state === 'connecting' || state === 'live') return;

    // Circuit breaker: stop if too many consecutive failures
    if (this.circuitOpen) {
      console.debug('[stream-store] Circuit breaker open, not attempting reconnect');
      return;
    }

    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const { useTabCoordination } = this.config;

    try {
      if (useTabCoordination) {
        await initTabCoordinator();
        if (signal.aborted) return;

        this.broadcastCleanup?.();
        this.broadcastCleanup = onNotification((notification) => {
          if (!isLeader()) this.config.processNotification(notification);
        });

        if (!isLeader()) {
          console.debug('[stream-store] Not leader, listening to broadcasts only');
          this.useStore.getState().setState('live');
          return;
        }
      }

      // Phase 1: Fetch and process catchup summary
      this.useStore.getState().setState('catching-up');

      const currentCursor = useTabCoordination ? useSyncStore.getState().cursor : this.useStore.getState().cursor;

      console.debug('[stream-store] Fetching catchup from offset:', currentCursor ?? 'null');
      const newCursor = await this.config.fetchAndProcessCatchup(currentCursor);
      if (signal.aborted) return;

      if (newCursor) {
        this.useStore.getState().setCursor(newCursor);
        if (useTabCoordination) {
          useSyncStore.getState().setCursor(newCursor);
          useSyncStore.getState().setLastSyncAt(new Date().toISOString());
        }
      }

      this.useStore.getState().setIsFirstConnect(false);

      console.debug('[stream-store] Catchup complete, cursor:', newCursor);

      // Reset circuit breaker and backoff on success
      this.consecutiveFailures = 0;
      this.currentBackoff = INITIAL_BACKOFF_MS;

      if (!signal.aborted) this.connectSSE();
    } catch (error) {
      if (!signal.aborted) {
        this.consecutiveFailures++;
        const isPermanentError = this.isPermanentError(error);

        console.error('[stream-store] Catchup failed:', error);
        this.useStore.getState().setState('error');

        // Open circuit breaker for permanent errors or after max failures
        if (isPermanentError || this.consecutiveFailures >= MAX_FAILURES) {
          this.openCircuit(isPermanentError ? 'permanent error detected' : 'max consecutive failures');
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
    const { endpoint, withCredentials, useTabCoordination } = this.config;

    const sseUrl = new URL(endpoint);

    this.useStore.getState().setState('connecting');
    const eventSource = new EventSource(sseUrl.toString(), { withCredentials });

    eventSource.onopen = () => {
      console.debug('[stream-store] SSE connected, waiting for offset...');
    };

    eventSource.addEventListener('change', (e) => {
      try {
        const notification = JSON.parse(e.data);
        const eventId = e.lastEventId || undefined;

        if (eventId) {
          this.useStore.getState().setCursor(eventId);
          if (useTabCoordination) useSyncStore.getState().setCursor(eventId);
        }

        if (useTabCoordination && isLeader()) broadcastNotification(notification, 'user');
        this.config.processNotification(notification);
      } catch (error) {
        console.debug('[stream-store] Failed to parse message:', error);
      }
    });

    eventSource.addEventListener('offset', (e) => {
      console.debug('[stream-store] SSE offset received:', e.data);
      if (e.data) {
        this.useStore.getState().setCursor(e.data);
        if (useTabCoordination) useSyncStore.getState().setCursor(e.data);
      }
      // Reset failure count and backoff on successful connection
      this.consecutiveFailures = 0;
      this.currentBackoff = INITIAL_BACKOFF_MS;
      this.useStore.getState().setState('live');
    });

    eventSource.addEventListener('ping', () => {});

    eventSource.onerror = () => {
      this.consecutiveFailures++;
      console.debug('[stream-store] SSE error');

      this.useStore.getState().setState('error');
      eventSource.close();
      this.eventSource = null;

      if (this.consecutiveFailures >= MAX_FAILURES) {
        this.openCircuit('max consecutive SSE failures');
        return;
      }

      this.scheduleReconnect();
    };

    this.eventSource = eventSource;
  }

  private openCircuit(reason: string) {
    this.circuitOpen = true;
    this.circuitOpenedAt = Date.now();
    console.warn('[stream-store] Circuit breaker opened:', reason);
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout || this.circuitOpen) return;

    const delay = this.currentBackoff;
    this.currentBackoff = Math.min(MAX_BACKOFF_MS, delay * BACKOFF_FACTOR);

    console.debug('[stream-store] Scheduling reconnect in', delay / 1000, 's');
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  /**
   * Attempt reconnect with circuit breaker + health check gate.
   * Used by visibility/leader handlers instead of the forced `reconnect()`.
   */
  private async attemptReconnect() {
    // If circuit isn't open, just connect normally
    if (!this.circuitOpen) {
      this.connect();
      return;
    }

    // Check if cooldown has elapsed
    const elapsed = Date.now() - (this.circuitOpenedAt ?? 0);
    if (elapsed < CIRCUIT_COOLDOWN_MS) {
      console.debug(
        '[stream-store] Circuit cooldown:',
        Math.round((CIRCUIT_COOLDOWN_MS - elapsed) / 1000),
        's remaining',
      );
      return;
    }

    // Prevent concurrent health checks
    if (this.healthCheckInProgress) return;
    this.healthCheckInProgress = true;

    console.debug('[stream-store] Circuit cooldown elapsed, checking health');

    try {
      const response = await fetch(HEALTH_URL);
      if (response.ok) {
        console.debug('[stream-store] Health check passed, reconnecting');
        this.reconnect();
      } else {
        // Health check failed — reset cooldown timer
        this.circuitOpenedAt = Date.now();
        console.debug('[stream-store] Health check failed, extending cooldown');
      }
    } catch {
      this.circuitOpenedAt = Date.now();
      console.debug('[stream-store] Health check unreachable, extending cooldown');
    } finally {
      this.healthCheckInProgress = false;
    }
  }

  /** Start listening for visibility changes to reconnect when tab becomes visible. */
  private startVisibilityReconnect() {
    if (this.visibilityHandler) return;
    this.visibilityHandler = () => {
      const shouldReconnect = this.config.useTabCoordination ? isLeader() : true;
      if (document.visibilityState === 'visible' && shouldReconnect && !this.isConnected()) {
        console.debug('[stream-store] Tab visible, attempting reconnect...');
        this.attemptReconnect();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private stopVisibilityReconnect() {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  /** Subscribe to leader changes and reconnect when becoming leader. */
  private startLeaderReconnect() {
    if (!this.config.useTabCoordination || this.leaderUnsubscribe) return;
    let wasLeader = useTabCoordinatorStore.getState().isLeader;
    this.leaderUnsubscribe = useTabCoordinatorStore.subscribe((s) => {
      if (s.isLeader && !wasLeader && !this.isConnected()) {
        console.debug('[stream-store] Became leader, attempting reconnect...');
        this.attemptReconnect();
      }
      wasLeader = s.isLeader;
    });
  }

  private stopLeaderReconnect() {
    this.leaderUnsubscribe?.();
    this.leaderUnsubscribe = null;
  }

  disconnect() {
    this.stopVisibilityReconnect();
    this.stopLeaderReconnect();

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
    this.useStore.getState().setState('disconnected');
  }

  /** Reset circuit breaker and failure count. Call when auth state changes. */
  resetCircuitBreaker() {
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.circuitOpenedAt = null;
    this.currentBackoff = INITIAL_BACKOFF_MS;
  }

  reconnect() {
    this.resetCircuitBreaker();
    this.disconnect();
    this.connect();
  }
}

// Public Stream

export const publicStreamManager = new StreamManager('PublicStream', {
  endpoint: `${appConfig.backendUrl}/entities/public/stream`,
  withCredentials: false,
  useTabCoordination: false,
  fetchAndProcessCatchup: async (offset) => {
    const seqs = useSyncStore.getState().seqs;
    const seqsParam = Object.keys(seqs).length > 0 ? seqs : undefined;
    const response = await postPublicCatchup({
      body: { cursor: offset ?? undefined, seqs: seqsParam },
    });
    processPublicCatchup(response);
    return response.cursor ?? null;
  },
  processNotification: (notification) => handlePublicStreamNotification(notification as StreamNotification),
});

// App Stream

export const appStreamManager = new StreamManager('AppStream', {
  endpoint: `${appConfig.backendUrl}/entities/app/stream`,
  withCredentials: true,
  useTabCoordination: true,
  fetchAndProcessCatchup: async (offset) => {
    const seqs = useSyncStore.getState().seqs;
    const seqsParam = Object.keys(seqs).length > 0 ? seqs : undefined;
    const response = await postAppCatchup({
      body: { cursor: offset ?? undefined, seqs: seqsParam },
    });
    processAppCatchup(response);
    return response.cursor ?? null;
  },
  processNotification: (notification) => handleAppStreamNotification(notification as AppStreamNotification),
});
