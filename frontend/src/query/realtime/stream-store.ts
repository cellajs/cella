import { postAppCatchup } from 'sdk';
import { appConfig } from 'shared';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { isDebugMode } from '~/env';
import { reportCriticalError } from '~/lib/tracing';
import { setSyncStreamHealthy } from '~/query/basic/sync-stale-config';
import { type CatchupViewRequest, syncStore } from '~/query/realtime/sync-store';
import { handleAppStreamNotification } from './app-stream-handler';
import { catchupEntityTypes, processAppCatchup } from './catchup-processor';
import {
  broadcastNotification,
  initTabCoordinator,
  isLeader,
  onNotification,
  tabCoordinatorStore,
} from './tab-coordinator';
import type { AppStreamNotification, StreamState } from './types';
import { declareViewsFromMemberships } from './view-declaration';

const MAX_FAILURES = 3;
const CIRCUIT_COOLDOWN_MS = 60_000;
const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_FACTOR = 2;
const RECONNECT_JITTER_MS = 2_000; // Random 0-2s added to reconnect delay to avoid thundering herd
const MIN_UPTIME_MS = 10_000; // Connection must stay up 10s before backoff resets
const HEALTH_URL = `${appConfig.backendUrl}/auth/health`;
const NOTIFICATION_BUFFER_CAP = 500; // Buffered live notifications while catchup runs; overflow retries catchup once

interface StreamConfig {
  endpoint: string;
  withCredentials: boolean;
  useTabCoordination: boolean;
  fetchAndProcessCatchup: (cursor: string | null) => Promise<string | null>;
  /** Process a single live SSE notification. */
  processNotification: (notification: unknown) => void;
}

interface StreamStoreState {
  state: StreamState;
  cursor: string | null;
}

interface StreamStoreActions {
  setState: (state: StreamState) => void;
  setCursor: (cursor: string | null) => void;
  reset: () => void;
}

type StreamStore = StreamStoreState & StreamStoreActions;

const initStore: StreamStoreState = { state: 'disconnected', cursor: null };

function createStreamStore(name: string) {
  return create<StreamStore>()(
    devtools(
      (set) => ({
        ...initStore,
        setState: (state) => set({ state }),
        setCursor: (cursor) => set({ cursor }),
        reset: () => set(initStore),
      }),
      { name, enabled: isDebugMode },
    ),
  );
}

/** Page-lifetime gate the query provider awaits before replaying paused mutations against restored cache state. */
let initialCatchupResolve: (() => void) | null = null;
const initialCatchupGate: Promise<void> = new Promise<void>((resolve) => {
  initialCatchupResolve = resolve;
});

/** Called by any StreamManager after its first successful catchup. */
function resolveInitialCatchupGate() {
  initialCatchupResolve?.();
  initialCatchupResolve = null;
}

/** Manages SSE connection lifecycle with Zustand store for state. Exported for tests. */
export class StreamManager {
  private config: StreamConfig;
  private eventSource: EventSource | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private broadcastCleanup: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private circuitOpenedAt: number | null = null;
  private currentBackoff = INITIAL_BACKOFF_MS;
  private connectedAt: number | null = null;
  private healthCheckInProgress = false;
  private visibilityHandler: (() => void) | null = null;
  private leaderUnsubscribe: (() => void) | null = null;

  /** Resolves when the current connect cycle's catchup completes. Reset on each connect(). */
  private catchupResolve: (() => void) | null = null;

  /** Notifications arriving between SSE open and catchup completion, drained in arrival order so a change committed while catchup reads is not lost. */
  private pendingNotifications: Array<{ notification: unknown; eventId: string | undefined }> = [];
  private buffering = false;
  private bufferOverflowed = false;

  readonly useStore: ReturnType<typeof createStreamStore>;
  private readonly name: string;

  constructor(name: string, config: StreamConfig) {
    this.name = name;
    this.config = config;
    this.useStore = createStreamStore(name);
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  /** Subscribe before catchup and buffer live events, so a change in the registration window lands in either snapshot or buffer. */
  async connect() {
    // Idempotent, cleaned up in disconnect.
    this.startVisibilityReconnect();
    this.startLeaderReconnect();

    const { state } = this.useStore.getState();
    if (state === 'catching-up' || state === 'connecting' || state === 'live') return;

    if (this.circuitOpen) {
      console.debug(`[${this.name}] Circuit breaker open, not attempting reconnect`);
      return;
    }

    // Fresh resolve callback per connect cycle; drives initialCatchupGate.
    let resolveCatchup: () => void;
    new Promise<void>((r) => {
      resolveCatchup = r;
    });
    this.catchupResolve = resolveCatchup!;

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
          console.debug(`[${this.name}] Not leader, listening to broadcasts only`);
          this.useStore.getState().setState('live');
          return;
        }
      }
    } catch (error) {
      if (!signal.aborted) this.handleCatchupFailure(error);
      return;
    }

    // Open the firehose first; catchup runs when the server's `offset` event arrives.
    if (!signal.aborted) this.connectSSE(signal);
  }

  /** Catch up while buffering, then drain in arrival order and go live. One buffer overflow retries at the newer cursor; a second throws. */
  private async runCatchupCycle(signal: AbortSignal, eventSource: EventSource) {
    const { useTabCoordination } = this.config;

    try {
      this.useStore.getState().setState('catching-up');

      for (let round = 0; ; round++) {
        const currentCursor = useTabCoordination ? syncStore.getState().cursor : this.useStore.getState().cursor;

        console.debug(`[${this.name}] Fetching catchup from offset:`, currentCursor ?? 'null');
        const newCursor = await this.config.fetchAndProcessCatchup(currentCursor);
        if (signal.aborted || this.eventSource !== eventSource) return;

        if (newCursor) {
          this.useStore.getState().setCursor(newCursor);
          if (useTabCoordination) {
            syncStore.getState().setCursor(newCursor);
            syncStore.getState().setLastSyncAt(new Date().toISOString());
          }
        }

        console.debug(`[${this.name}] Catchup complete, cursor:`, newCursor);

        if (!this.bufferOverflowed) break;
        if (round >= 1) throw new Error('Notification buffer overflowed twice during catchup');
        // Dropped buffered events are covered by re-reading catchup at the newer cursor.
        this.bufferOverflowed = false;
        this.pendingNotifications = [];
        console.debug(`[${this.name}] Notification buffer overflowed, re-running catchup`);
      }

      // Release paused mutations before draining; drain is idempotent ingestion.
      this.catchupResolve?.();
      this.catchupResolve = null;
      resolveInitialCatchupGate();

      // Drain is synchronous, so no notification interleaves; arrivals after this point process directly.
      this.buffering = false;
      const buffered = this.pendingNotifications;
      this.pendingNotifications = [];
      for (const { notification, eventId } of buffered) this.applyNotification(notification, eventId);

      // Backoff itself resets only after MIN_UPTIME_MS of uptime, checked in onerror.
      this.consecutiveFailures = 0;
      this.connectedAt = Date.now();
      this.useStore.getState().setState('live');
    } catch (error) {
      if (signal.aborted || this.eventSource !== eventSource) return;
      // Catchup failed while SSE is open: close it, the reconnect cycle re-runs both phases.
      eventSource.close();
      this.eventSource = null;
      this.handleCatchupFailure(error);
    }
  }

  /** Shared failure path for catchup/tab-coordination errors: error state, gate release, circuit/backoff. */
  private handleCatchupFailure(error: unknown) {
    this.consecutiveFailures++;
    const isPermanentError = this.isPermanentError(error);

    console.error(`[${this.name}] Catchup failed:`, error);
    reportCriticalError('realtime.catchup_failed', error, {
      stream: this.name,
      consecutiveFailures: this.consecutiveFailures,
    });
    this.useStore.getState().setState('error');

    // Resolve catchup promise on failure so paused mutations aren't stuck forever
    this.catchupResolve?.();
    this.catchupResolve = null;
    resolveInitialCatchupGate();

    // Open circuit breaker for permanent errors or after max failures
    if (isPermanentError || this.consecutiveFailures >= MAX_FAILURES) {
      this.openCircuit(isPermanentError ? 'permanent error detected' : 'max consecutive failures');
      return;
    }

    this.scheduleReconnect();
  }

  /** Advance the stream cursor and hand one notification to the app-level processor. */
  private applyNotification(notification: unknown, eventId: string | undefined) {
    if (eventId) {
      this.useStore.getState().setCursor(eventId);
      if (this.config.useTabCoordination) syncStore.getState().setCursor(eventId);
    }
    this.config.processNotification(notification);
  }

  private isPermanentError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status;
      return status === 401 || status === 403;
    }
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('Access denied') || message.includes('Unauthorized');
  }

  private connectSSE(signal: AbortSignal) {
    const { endpoint, withCredentials, useTabCoordination } = this.config;

    const sseUrl = new URL(endpoint);

    this.useStore.getState().setState('connecting');
    this.buffering = true;
    this.bufferOverflowed = false;
    this.pendingNotifications = [];
    let catchupStarted = false;
    const eventSource = new EventSource(sseUrl.toString(), { withCredentials });

    eventSource.onopen = () => {
      console.debug(`[${this.name}] SSE connected, waiting for offset...`);
    };

    eventSource.addEventListener('change', (e) => {
      try {
        const notification = JSON.parse(e.data);
        const eventId = e.lastEventId || undefined;

        // Followers receive at arrival time in both phases; only local processing is deferred.
        if (useTabCoordination && isLeader()) broadcastNotification(notification, 'user');

        if (this.buffering) {
          // Cursor advances at drain time so a crash before drain re-fetches from the old cursor.
          if (this.bufferOverflowed) return;
          if (this.pendingNotifications.length >= NOTIFICATION_BUFFER_CAP) {
            this.bufferOverflowed = true;
            this.pendingNotifications = [];
            return;
          }
          this.pendingNotifications.push({ notification, eventId });
          return;
        }

        this.applyNotification(notification, eventId);
      } catch (error) {
        console.debug(`[${this.name}] Failed to parse message:`, error);
      }
    });

    eventSource.addEventListener('offset', (e) => {
      console.debug(`[${this.name}] SSE offset received:`, e.data);
      // The offset value is not stored: the catchup response cursor, read later, supersedes it.
      if (catchupStarted) return;
      catchupStarted = true;
      void this.runCatchupCycle(signal, eventSource);
    });

    // Server-sent error event with a typed payload; the bare transport Event goes to `onerror`.
    eventSource.addEventListener('error', (e) => {
      if (!(e instanceof MessageEvent) || !e.data) return; // transport error -> falls through to onerror
      try {
        const payload = JSON.parse(e.data) as { code?: string; message?: string };
        const permanent =
          payload.code === 'unauthorized' || payload.code === 'forbidden' || payload.code === 'tenant_revoked';
        console.debug(`[${this.name}] Server stream error:`, payload);
        eventSource.close();
        this.eventSource = null;
        this.useStore.getState().setState('error');
        if (permanent) {
          this.openCircuit(`server error: ${payload.code}`);
        } else {
          this.scheduleReconnect();
        }
      } catch {
        // Malformed payload, let onerror handle the eventual transport close.
      }
    });

    eventSource.onerror = () => {
      this.consecutiveFailures++;
      console.debug(`[${this.name}] SSE error`);

      // Reset backoff only after stable uptime, so a flapping connection keeps backing off.
      if (this.connectedAt && Date.now() - this.connectedAt >= MIN_UPTIME_MS) {
        this.currentBackoff = INITIAL_BACKOFF_MS;
      }
      this.connectedAt = null;

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
    console.warn(`[${this.name}] Circuit breaker opened:`, reason);

    // Cancel the pending reconnect so it cannot fire while the circuit is open.
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout || this.circuitOpen) return;

    const jitter = Math.random() * RECONNECT_JITTER_MS;
    const delay = this.currentBackoff + jitter;
    this.currentBackoff = Math.min(MAX_BACKOFF_MS, this.currentBackoff * BACKOFF_FACTOR);

    console.debug(`[${this.name}] Scheduling reconnect in`, Math.round(delay / 1000), 's');
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  /** Reconnect gated by circuit breaker and health check; visibility and leader handlers use this path, `reconnect()` forces. */
  private async attemptReconnect() {
    if (!this.circuitOpen) {
      this.connect();
      return;
    }

    const elapsed = Date.now() - (this.circuitOpenedAt ?? 0);
    if (elapsed < CIRCUIT_COOLDOWN_MS) {
      console.debug(
        `[${this.name}] Circuit cooldown:`,
        Math.round((CIRCUIT_COOLDOWN_MS - elapsed) / 1000),
        's remaining',
      );
      return;
    }

    if (this.healthCheckInProgress) return;
    this.healthCheckInProgress = true;

    console.debug(`[${this.name}] Circuit cooldown elapsed, checking health`);

    try {
      const response = await fetch(HEALTH_URL);
      if (response.ok) {
        console.debug(`[${this.name}] Health check passed, reconnecting`);
        this.reconnect();
      } else {
        this.circuitOpenedAt = Date.now();
        console.debug(`[${this.name}] Health check failed, extending cooldown`);
      }
    } catch {
      this.circuitOpenedAt = Date.now();
      console.debug(`[${this.name}] Health check unreachable, extending cooldown`);
    } finally {
      this.healthCheckInProgress = false;
    }
  }

  private startVisibilityReconnect() {
    if (this.visibilityHandler) return;
    this.visibilityHandler = () => {
      const shouldReconnect = this.config.useTabCoordination ? isLeader() : true;
      if (document.visibilityState === 'visible' && shouldReconnect && !this.isConnected()) {
        console.debug(`[${this.name}] Tab visible, attempting reconnect...`);
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

  private startLeaderReconnect() {
    if (!this.config.useTabCoordination || this.leaderUnsubscribe) return;
    let wasLeader = tabCoordinatorStore.getState().isLeader;
    this.leaderUnsubscribe = tabCoordinatorStore.subscribe((s) => {
      if (s.isLeader && !wasLeader && !this.isConnected()) {
        console.debug(`[${this.name}] Became leader, reconnecting...`);
        this.reconnect();
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
    this.resolvePendingCatchup();

    this.buffering = false;
    this.bufferOverflowed = false;
    this.pendingNotifications = [];

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
    this.connectedAt = null;
    this.useStore.getState().setState('disconnected');
  }

  /** Reset circuit breaker and failure count. Call when auth state changes. */
  resetCircuitBreaker() {
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.circuitOpenedAt = null;
    this.connectedAt = null;
    this.currentBackoff = INITIAL_BACKOFF_MS;
  }

  reconnect() {
    this.resetCircuitBreaker();
    this.disconnect();
    this.connect();
  }

  /** Resolve the pending catchup promise so disconnect leaves no waiter hanging. */
  private resolvePendingCatchup() {
    this.catchupResolve?.();
    this.catchupResolve = null;
    resolveInitialCatchupGate();
  }
}

// App Stream

type CatchupBody = NonNullable<Parameters<typeof postAppCatchup>[0]>['body'];
type CatchupView = NonNullable<CatchupBody['views']>[number];
type CatchupProductType = CatchupView['entityTypes'][number];

const isCatchupProductType = (entityType: string): entityType is CatchupProductType =>
  (appConfig.productEntityTypes as readonly string[]).includes(entityType);

/** Drop runtime entity types the catchup endpoint rejects: one unrecognized type would fail the whole request and stall catchup for every view. */
function toCatchupViews(views: readonly CatchupViewRequest[]): CatchupView[] {
  const accepted: CatchupView[] = [];
  for (const view of views) {
    const entityTypes = view.entityTypes.filter(isCatchupProductType);
    if (entityTypes.length === 0) continue;
    accepted.push({ ...view, entityTypes });
  }
  return accepted;
}

export const appStreamManager = new StreamManager('AppStream', {
  endpoint: `${appConfig.backendUrl}/entities/app/stream`,
  withCredentials: true,
  useTabCoordination: true,
  fetchAndProcessCatchup: async (cursor) => {
    // Combine baseline organization views with membership-derived grant boundaries.
    declareViewsFromMemberships();
    const views = toCatchupViews(syncStore.getState().getCatchupViews(catchupEntityTypes()));
    const response = await postAppCatchup({
      body: {
        cursor: cursor ?? undefined,
        views: views.length > 0 ? views : undefined,
      },
    });
    await processAppCatchup(response, !cursor);
    return response.cursor ?? null;
  },
  processNotification: (notification) => handleAppStreamNotification(notification as AppStreamNotification),
});

// Mirrors stream health into the basic layer without a circular import: catch-up reconciles every connection, so only errors enable time-based freshness.
appStreamManager.useStore.subscribe((s) => setSyncStreamHealthy(s.state !== 'error'));

/** Resolves on the first catchup after page load, or on its failure. Safe to call before any stream connects. */
export function waitForActiveCatchup(): Promise<void> {
  return initialCatchupGate;
}
