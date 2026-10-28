import { type PostAppCatchupResponse, postAppCatchup, type StreamChange, type StreamSignal } from 'sdk';
import { appConfig, isProduct } from 'shared';
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import { isDebugMode } from '~/env';
import { reportCriticalError } from '~/lib/tracing';
import { getRegisteredProductEntityTypes } from '~/query/basic/entity-query-registry';
import { setSyncStreamHealthy, setSyncWorkerAway } from '~/query/basic/sync-stale-state';
import { handleStreamChange } from '~/query/realtime/app-stream-handler';
import { processAppCatchup } from '~/query/realtime/catchup-processor';
import { handleStreamSignal } from '~/query/realtime/signal-handlers';
import { type CatchupViewRequest, syncStore } from '~/query/realtime/sync-store';
import {
  broadcastCatchup,
  broadcastStreamChange,
  broadcastStreamSignal,
  broadcastSyncHealth,
  initTabCoordinator,
  isLeader,
  onCatchup,
  onStreamChange,
  onStreamSignal,
  onSyncHealth,
  type SyncHealth,
  tabCoordinatorStore,
} from '~/query/realtime/tab-coordinator';
import type { StreamState } from '~/query/realtime/types';
import { declareViewsFromMemberships } from '~/query/realtime/view-declaration';

const maxFailures = 3;
const circuitCooldownMs = 60_000;
const initialBackoffMs = 5_000;
const maxBackoffMs = 30_000;
const backoffFactor = 2;
/** A random share of this is added to each reconnect delay, so streams that dropped together do not reconnect together. */
const reconnectJitterMs = 2_000;
/** A connection that stayed up this long starts the backoff from the beginning when it fails: a flapping one keeps backing off. */
const minUptimeMs = 10_000;
const healthUrl = `${appConfig.backendUrl}/auth/health`;
/** Live changes buffered while catchup runs. */
const changeBufferCap = 500;
/** 2.5 of the server's 30-second keepalive intervals without any event: the open stream is dead. */
const streamSilenceMs = 75_000;
/** What a ping of the app stream carries while the server's CDC worker has not been reading for a minute. */
const workerAwayPing = 'worker_away';

interface StreamConfig {
  endpoint: string;
  withCredentials: boolean;
  useTabCoordination: boolean;
  fetchAndProcessCatchup: (cursor: string | null) => Promise<string | null>;
  /** A follower's side of catchup: process the answer the leader passed on. */
  processLeaderCatchup: (response: PostAppCatchupResponse, baselineOnly: boolean) => Promise<void>;
  processChange: (change: StreamChange) => void;
  processSignal: (signal: StreamSignal) => void;
  /** Called with the data of every keepalive: empty, or the standing fact the server repeats with each one. */
  onPing?: (data: string) => void;
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
  return createStore<StreamStore>()(
    devtools(
      (set) => ({
        ...initStore,
        setState: (state) => set({ state }),
        setCursor: (cursor) => set({ cursor }),
        reset: () => set(initStore),
      }),
      {
        name,
        enabled: isDebugMode,
      },
    ),
  );
}

/** Page-lifetime gate the query provider awaits before replaying paused mutations against restored cache state. */
let initialCatchupResolve: (() => void) | null = null;
const initialCatchupGate: Promise<void> = new Promise<void>((resolve) => {
  initialCatchupResolve = resolve;
});

/** Opens the gate; any later call does nothing. */
function resolveInitialCatchupGate() {
  initialCatchupResolve?.();
  initialCatchupResolve = null;
}

/** Owns one SSE connection: catchup, reconnect, backoff and the circuit breaker. Exported for tests. */
export class StreamManager {
  private config: StreamConfig;
  private eventSource: EventSource | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private broadcastCleanup: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private circuitOpenedAt: number | null = null;
  private currentBackoff = initialBackoffMs;
  private connectedAt: number | null = null;
  private healthCheckInProgress = false;
  private visibilityHandler: (() => void) | null = null;
  private leaderUnsubscribe: (() => void) | null = null;
  private silenceTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Time of the last event of any kind on the open EventSource. */
  private lastEventAt = 0;

  /** Changes arriving between SSE open and catchup completion, drained in arrival order so a change committed while catchup reads is not lost. */
  private pendingChanges: Array<{ change: StreamChange; eventId: string | undefined }> = [];
  private buffering = false;
  private bufferOverflowed = false;

  readonly store: ReturnType<typeof createStreamStore>;
  private readonly name: string;

  constructor(name: string, config: StreamConfig) {
    this.name = name;
    this.config = config;
    this.store = createStreamStore(name);
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  /** Subscribe before catchup and buffer live events, so a change in the registration window reaches either the snapshot or the buffer. */
  async connect() {
    // Idempotent, cleaned up in disconnect.
    this.startVisibilityReconnect();
    this.startLeaderReconnect();

    const { state } = this.store.getState();
    if (state === 'catching-up' || state === 'connecting' || state === 'live') return;

    if (this.circuitOpen) {
      console.debug(`[${this.name}] Circuit breaker open, not attempting reconnect`);
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
        const stopChanges = onStreamChange((change) => {
          if (!isLeader()) this.config.processChange(change);
        });
        const stopSignals = onStreamSignal((signal) => {
          if (!isLeader()) this.config.processSignal(signal);
        });
        const stopCatchup = onCatchup(({ response, baselineOnly }) => {
          if (!isLeader()) void this.followLeaderCatchup(response, baselineOnly, signal);
        });
        this.broadcastCleanup = () => {
          stopChanges();
          stopSignals();
          stopCatchup();
        };

        if (!isLeader()) {
          console.debug(`[${this.name}] Not leader, listening to broadcasts only`);
          this.store.getState().setState('live');
          // A follower runs no catchup of its own: writes that wait for the first one are released now.
          resolveInitialCatchupGate();
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
      this.store.getState().setState('catching-up');

      for (let round = 0; ; round++) {
        const currentCursor = useTabCoordination ? syncStore.getState().cursor : this.store.getState().cursor;

        console.debug(`[${this.name}] Fetching catchup from offset:`, currentCursor ?? 'null');
        const newCursor = await this.config.fetchAndProcessCatchup(currentCursor);
        if (signal.aborted || this.eventSource !== eventSource) return;

        if (newCursor) {
          this.store.getState().setCursor(newCursor);
          if (useTabCoordination) syncStore.getState().setCursor(newCursor);
        }

        console.debug(`[${this.name}] Catchup complete, cursor:`, newCursor);

        if (!this.bufferOverflowed) break;
        if (round >= 1) throw new Error('Change buffer overflowed twice during catchup');
        // Dropped buffered changes are covered by re-reading catchup at the newer cursor.
        this.bufferOverflowed = false;
        this.pendingChanges = [];
        console.debug(`[${this.name}] Change buffer overflowed, re-running catchup`);
      }

      // Release paused mutations before draining; drain is idempotent ingestion.
      resolveInitialCatchupGate();

      // Drain is synchronous, so no change interleaves; arrivals after this point process directly.
      this.buffering = false;
      const buffered = this.pendingChanges;
      this.pendingChanges = [];
      for (const { change, eventId } of buffered) this.applyChange(change, eventId);

      // Backoff itself resets only after minUptimeMs of uptime, checked in handleStreamFailure.
      this.consecutiveFailures = 0;
      this.connectedAt = Date.now();
      this.store.getState().setState('live');
    } catch (error) {
      if (signal.aborted || this.eventSource !== eventSource) return;
      // Catchup failed while SSE is open: close it, the reconnect cycle re-runs both phases.
      this.closeEventSource();
      this.handleCatchupFailure(error);
    }
  }

  /** A follower's catchup: it sends no request, processes the answer the leader passed on and stores that answer's cursor. */
  private async followLeaderCatchup(response: PostAppCatchupResponse, baselineOnly: boolean, signal: AbortSignal) {
    try {
      await this.config.processLeaderCatchup(response, baselineOnly);
      // Stored once processed, as on the leader, so this tab's first request as leader carries a current cursor. A connect cycle that ended meanwhile stores nothing.
      if (response.cursor && !signal.aborted) syncStore.getState().setCursor(response.cursor);
    } catch (error) {
      console.warn(`[${this.name}] Could not process the leader's catchup answer:`, error);
    }
  }

  /** The one failure path of a catchup or a tab election. */
  private handleCatchupFailure(error: unknown) {
    this.consecutiveFailures++;
    const isPermanentError = this.isPermanentError(error);

    console.error(`[${this.name}] Catchup failed:`, error);
    reportCriticalError('realtime.catchup_failed', error, { stream: this.name, consecutive_failures: this.consecutiveFailures });
    this.store.getState().setState('error');

    if (isPermanentError || this.consecutiveFailures >= maxFailures) {
      this.openCircuit(isPermanentError ? 'permanent error detected' : 'max consecutive failures', isPermanentError);
      return;
    }

    // A failure that keeps the session opens the gate too, so paused mutations are not stuck forever.
    resolveInitialCatchupGate();
    this.scheduleReconnect();
  }

  private applyChange(change: StreamChange, eventId: string | undefined) {
    if (eventId) {
      this.store.getState().setCursor(eventId);
      if (this.config.useTabCoordination) syncStore.getState().setCursor(eventId);
    }
    // Followers get a change when the leader applies it: one buffered during catchup reaches them after the catchup answer, in the leader's order.
    if (this.config.useTabCoordination && isLeader()) broadcastStreamChange(change);
    this.config.processChange(change);
  }

  private isPermanentError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'status' in error) return error.status === 401 || error.status === 403;
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('Access denied') || message.includes('Unauthorized');
  }

  private connectSSE(signal: AbortSignal) {
    const { endpoint, withCredentials } = this.config;

    // A stream that is still open here is replaced, and its watchdog goes with it.
    this.closeEventSource();
    this.store.getState().setState('connecting');
    this.buffering = true;
    this.bufferOverflowed = false;
    this.pendingChanges = [];
    let catchupStarted = false;
    const eventSource = new EventSource(endpoint, { withCredentials });
    const noteActivity = () => {
      this.lastEventAt = Date.now();
    };

    eventSource.onopen = () => {
      console.debug(`[${this.name}] SSE connected, waiting for offset...`);
    };

    eventSource.addEventListener('change', (event) => {
      noteActivity();
      try {
        const change = JSON.parse(event.data);
        const eventId = event.lastEventId || undefined;

        if (this.buffering) {
          // Cursor advances at drain time so a crash before drain re-fetches from the old cursor.
          if (this.bufferOverflowed) return;
          if (this.pendingChanges.length >= changeBufferCap) {
            this.bufferOverflowed = true;
            this.pendingChanges = [];
            return;
          }
          this.pendingChanges.push({ change, eventId });
          return;
        }

        this.applyChange(change, eventId);
      } catch (error) {
        console.debug(`[${this.name}] Failed to parse change:`, error);
      }
    });

    // A signal is handled at once, also during catchup, and never moves the cursor: `lastEventId` still names the last change.
    eventSource.addEventListener('signal', (event) => {
      noteActivity();
      try {
        const signal: StreamSignal = JSON.parse(event.data);
        if (this.config.useTabCoordination && isLeader()) broadcastStreamSignal(signal);
        this.config.processSignal(signal);
      } catch (error) {
        console.debug(`[${this.name}] Failed to parse signal:`, error);
      }
    });

    eventSource.addEventListener('offset', (event) => {
      noteActivity();
      console.debug(`[${this.name}] SSE offset received:`, event.data);
      // The offset value is not stored: the catchup response cursor, read later, supersedes it.
      if (catchupStarted) return;
      catchupStarted = true;
      void this.runCatchupCycle(signal, eventSource);
    });

    // The server's keepalive shows that the stream is alive, and carries the one standing fact the server has to tell.
    eventSource.addEventListener('ping', (event) => {
      noteActivity();
      this.config.onPing?.(typeof event.data === 'string' ? event.data : '');
    });

    // Server-sent error event with a typed payload; the bare transport Event goes to `onerror`.
    eventSource.addEventListener('error', (event) => {
      if (!(event instanceof MessageEvent) || !event.data) return;
      noteActivity();
      try {
        const payload: { code?: string; message?: string } = JSON.parse(event.data);
        const permanent = payload.code === 'unauthorized' || payload.code === 'forbidden' || payload.code === 'tenant_revoked';
        console.debug(`[${this.name}] Server stream error:`, payload);
        this.closeEventSource();
        this.store.getState().setState('error');
        if (permanent) {
          this.openCircuit(`server error: ${payload.code}`, true);
        } else {
          this.scheduleReconnect();
        }
      } catch {
        // Malformed payload, let onerror handle the eventual transport close.
      }
    });

    eventSource.onerror = () => this.handleStreamFailure('SSE error');

    this.eventSource = eventSource;
    noteActivity();
    this.watchForSilence(eventSource, streamSilenceMs);
  }

  /** One path for a stream that failed, by a transport error or by silence: count it, close it, then open the circuit or reconnect after the backoff. */
  private handleStreamFailure(reason: string) {
    this.consecutiveFailures++;
    console.debug(`[${this.name}] ${reason}`);

    if (this.connectedAt && Date.now() - this.connectedAt >= minUptimeMs) {
      this.currentBackoff = initialBackoffMs;
    }
    this.connectedAt = null;

    this.store.getState().setState('error');
    this.closeEventSource();

    if (this.consecutiveFailures >= maxFailures) {
      this.openCircuit('max consecutive SSE failures', false);
      return;
    }

    this.scheduleReconnect();
  }

  /** Fails a stream no event arrived on for streamSilenceMs: a browser keeps a connection open whose server is gone, and reports no error. */
  private watchForSilence(eventSource: EventSource, delay: number) {
    this.silenceTimeout = setTimeout(() => {
      this.silenceTimeout = null;
      if (this.eventSource !== eventSource) return;

      const remaining = this.lastEventAt + streamSilenceMs - Date.now();
      if (remaining > 0) return this.watchForSilence(eventSource, remaining);

      this.handleStreamFailure(`No event for ${streamSilenceMs / 1000}s, closing the silent stream`);
    }, delay);
  }

  /** The one place a stream is closed: its silence watchdog stops with it, so no timer outlives a stream. */
  private closeEventSource() {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    this.eventSource?.close();
    this.eventSource = null;
  }

  /** Stops reconnecting until the cooldown ends. A `permanent` circuit means the session or its access is gone. */
  private openCircuit(reason: string, permanent: boolean) {
    this.circuitOpen = true;
    this.circuitOpenedAt = Date.now();
    console.warn(`[${this.name}] Circuit breaker opened:`, reason);
    // Paused mutations replay through the API, which arbitrates them by their `replayed` stx. Without a session each
    // replay would answer 401 and move to failedSync, so a permanent circuit keeps them queued.
    if (!permanent) resolveInitialCatchupGate();

    // Cancel the pending reconnect so it cannot fire while the circuit is open.
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout || this.circuitOpen) return;

    const jitter = Math.random() * reconnectJitterMs;
    const delay = this.currentBackoff + jitter;
    this.currentBackoff = Math.min(maxBackoffMs, this.currentBackoff * backoffFactor);

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
    if (elapsed < circuitCooldownMs) {
      const secondsRemaining = Math.round((circuitCooldownMs - elapsed) / 1000);
      console.debug(`[${this.name}] Circuit cooldown:`, secondsRemaining, 's remaining');
      return;
    }

    if (this.healthCheckInProgress) return;
    this.healthCheckInProgress = true;

    console.debug(`[${this.name}] Circuit cooldown elapsed, checking health`);

    try {
      const response = await fetch(healthUrl);
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
      const shouldReconnect = !this.config.useTabCoordination || isLeader();
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
    this.leaderUnsubscribe = tabCoordinatorStore.subscribe((state) => {
      if (state.isLeader && !wasLeader && !this.isConnected()) {
        console.debug(`[${this.name}] Became leader, reconnecting...`);
        this.reconnect();
      }
      wasLeader = state.isLeader;
    });
  }

  private stopLeaderReconnect() {
    this.leaderUnsubscribe?.();
    this.leaderUnsubscribe = null;
  }

  /** Closes the stream for good. After `sessionLost` the gate stays closed, as on a permanent circuit. */
  disconnect({ sessionLost = false }: { sessionLost?: boolean } = {}) {
    this.stopVisibilityReconnect();
    this.stopLeaderReconnect();
    if (!sessionLost) resolveInitialCatchupGate();

    this.buffering = false;
    this.bufferOverflowed = false;
    this.pendingChanges = [];

    this.abortController?.abort();
    this.abortController = null;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.closeEventSource();

    this.broadcastCleanup?.();
    this.broadcastCleanup = null;
    this.connectedAt = null;
    this.store.getState().setState('disconnected');
  }

  /** Clears the circuit and the backoff; call when the auth state changes. */
  resetCircuitBreaker() {
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.circuitOpenedAt = null;
    this.connectedAt = null;
    this.currentBackoff = initialBackoffMs;
  }

  reconnect() {
    this.resetCircuitBreaker();
    this.disconnect();
    this.connect();
  }
}

type CatchupBody = NonNullable<Parameters<typeof postAppCatchup>[0]>['body'];
type CatchupView = NonNullable<CatchupBody['views']>[number];

/** Drop runtime entity types the catchup endpoint rejects: one unrecognized type would fail the whole request and stall catchup for every view. */
function toCatchupViews(views: readonly CatchupViewRequest[]): CatchupView[] {
  const accepted: CatchupView[] = [];
  for (const view of views) {
    const entityTypes = view.entityTypes.filter(isProduct);
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
    const views = toCatchupViews(syncStore.getState().getCatchupViews(getRegisteredProductEntityTypes()));
    const response = await postAppCatchup({ body: { cursor: cursor ?? undefined, views: views.length > 0 ? views : undefined } });
    const baselineOnly = !cursor;
    // Passed on before the leader processes it: followers fetch their gaps alongside the leader, and get the answer when its processing fails.
    if (isLeader()) broadcastCatchup(response, baselineOnly);
    await processAppCatchup(response, baselineOnly);
    return response.cursor ?? null;
  },
  processLeaderCatchup: processAppCatchup,
  processChange: handleStreamChange,
  processSignal: (signal) => handleStreamSignal(signal),
  onPing: (data) => {
    workerAway = data === workerAwayPing;
    publishSyncHealth();
  },
});

/** What the app stream last said of the server's CDC worker. A stream that is down says nothing new, and the first ping of the next one does. */
let workerAway = false;
let publishedHealth: SyncHealth | null = null;

/** Mirrors the health of live delivery into the basic layer without a circular import: either fact enables time-based freshness. */
function applySyncHealth(health: SyncHealth): void {
  setSyncStreamHealthy(health.streamHealthy);
  setSyncWorkerAway(health.workerAway);
}

/** Takes the health of live delivery from this tab's own stream and tells the follower tabs when it changed. Of the stream only the `error` state counts: each reconnect runs a catchup. */
function publishSyncHealth(): void {
  if (!isLeader()) return;
  const health: SyncHealth = { streamHealthy: appStreamManager.store.getState().state !== 'error', workerAway };
  if (publishedHealth?.streamHealthy === health.streamHealthy && publishedHealth.workerAway === health.workerAway) return;
  publishedHealth = health;
  applySyncHealth(health);
  broadcastSyncHealth(health);
}

appStreamManager.store.subscribe(publishSyncHealth);
// A follower takes the leader's word. Once it leads, its own stream connects and says, whatever it last heard.
onSyncHealth((health) => {
  if (isLeader()) return;
  publishedHealth = null;
  applySyncHealth(health);
});

/**
 * Resolves on the first catchup after page load or its failure, at once in a follower tab, and when the stream gives up.
 * A lost session (a 401 or 403 on catchup, a permanent server error, a disconnect after a 401) leaves it closed. Safe
 * to call before any stream connects.
 */
export function waitForActiveCatchup(): Promise<void> {
  return initialCatchupGate;
}
