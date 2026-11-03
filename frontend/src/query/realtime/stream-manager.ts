import { onlineManager } from '@tanstack/react-query';
import { type PostAppCatchupResponse, postAppCatchup, type StreamChange, type StreamSignal } from 'sdk';
import { appConfig } from 'shared';
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import { isDebugMode } from '~/env';
import { reportCriticalError } from '~/lib/tracing';
import { getRegisteredProductEntityTypes } from '~/query/basic/entity-query-registry';
import { setSyncStreamHealthy, setSyncWorkerAway } from '~/query/basic/sync-stale-state';
import { subscribeLocalUserChange } from '~/query/local-user-db';
import { reportReachable } from '~/query/offline/connectivity';
import { queryClient } from '~/query/query-client';
import { handleStreamChange } from '~/query/realtime/app-stream-handler';
import { processAppCatchup } from '~/query/realtime/catchup-processor';
import { handleStreamSignal } from '~/query/realtime/signal-handlers';
import { syncStore } from '~/query/realtime/sync-store';
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
/** A catchup, request and processing together, that takes longer fails: three in a row open the circuit for its cooldown. */
const catchupTimeoutMs = 60_000;
/** 2.5 of the server's 30-second keepalive intervals without any event: the open stream is dead. */
const streamSilenceMs = 75_000;
/** What a ping of the app stream carries while the server's CDC worker has not been reading for a minute. */
const workerAwayPing = 'worker_away';

interface StreamConfig {
  endpoint: string;
  withCredentials: boolean;
  useTabCoordination: boolean;
  /** `signal` aborts once the round outlasts its bound: a late answer then reaches neither the followers nor this tab's cache. */
  fetchAndProcessCatchup: (signal: AbortSignal) => Promise<void>;
  /** A follower's side of catchup: process the answer the leader passed on. */
  processLeaderCatchup: (response: PostAppCatchupResponse) => Promise<void>;
  processChange: (change: StreamChange) => void;
  processSignal: (signal: StreamSignal) => void;
  /** Called with the data of every keepalive: empty, or the standing fact the server repeats with each one. */
  onPing?: (data: string) => void;
}

interface StreamStoreState {
  state: StreamState;
}

interface StreamStoreActions {
  setState: (state: StreamState) => void;
  reset: () => void;
}

type StreamStore = StreamStoreState & StreamStoreActions;

const initStore: StreamStoreState = { state: 'disconnected' };

function createStreamStore(name: string) {
  return createStore<StreamStore>()(
    devtools(
      (set) => ({
        ...initStore,
        setState: (state) => set({ state }),
        reset: () => set(initStore),
      }),
      {
        name,
        enabled: isDebugMode,
      },
    ),
  );
}

/** The gate a restored queue awaits before it replays against reconciled cache state. */
let initialCatchupResolve: (() => void) | null = null;
let initialCatchupGate: Promise<void>;

/** Closes the gate unless it is closed: at page load, and for a user's database bound later, whose restored queue waits for that user's first catchup. */
function closeInitialCatchupGate() {
  if (initialCatchupResolve) return;
  initialCatchupGate = new Promise<void>((resolve) => {
    initialCatchupResolve = resolve;
  });
}
closeInitialCatchupGate();

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
  /** Opened by a refused session: no cooldown check and no back-online reconnect, only a tab that becomes visible looks again. */
  private circuitPermanent = false;
  private circuitOpenedAt: number | null = null;
  private currentBackoff = initialBackoffMs;
  private connectedAt: number | null = null;
  private healthCheckInProgress = false;
  private visibilityHandler: (() => void) | null = null;
  private leaderUnsubscribe: (() => void) | null = null;
  private onlineUnsubscribe: (() => void) | null = null;
  private silenceTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Time of the last event of any kind on the open EventSource. */
  private lastEventAt = 0;

  /** Changes arriving between SSE open and catchup completion, drained in arrival order so a change committed while catchup reads is not lost. */
  private pendingChanges: StreamChange[] = [];
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
    this.startOnlineReconnect();

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
        const stopCatchup = onCatchup((response) => {
          if (!isLeader()) void this.followLeaderCatchup(response);
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

  /** Catch up while buffering, then drain in arrival order and go live. One buffer overflow runs catchup again; a second throws. */
  private async runCatchupCycle(signal: AbortSignal, eventSource: EventSource) {
    try {
      this.store.getState().setState('catching-up');

      for (let round = 0; ; round++) {
        console.debug(`[${this.name}] Fetching catchup`);
        await this.boundedCatchup();
        if (signal.aborted || this.eventSource !== eventSource) return;
        console.debug(`[${this.name}] Catchup complete`);

        if (!this.bufferOverflowed) break;
        if (round >= 1) throw new Error('Change buffer overflowed twice during catchup');
        // A second catchup reads after every dropped change, so it covers them.
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
      for (const change of buffered) this.applyChange(change);

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

  /** The catchup of one round, failed and aborted once it takes longer than `catchupTimeoutMs`, so the gate paused writes wait on cannot stay closed. */
  private async boundedCatchup(): Promise<void> {
    const round = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        round.abort();
        reject(new Error(`Catchup took longer than ${catchupTimeoutMs / 1000}s`));
      }, catchupTimeoutMs);
    });
    try {
      await Promise.race([this.config.fetchAndProcessCatchup(round.signal), expiry]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** A follower's catchup: it sends no request and processes the answer the leader passed on. */
  private async followLeaderCatchup(response: PostAppCatchupResponse) {
    try {
      await this.config.processLeaderCatchup(response);
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

    // Open the gate on failure too, so paused mutations are not stuck forever.
    resolveInitialCatchupGate();

    if (isPermanentError || this.consecutiveFailures >= maxFailures) {
      this.openCircuit(isPermanentError ? 'permanent error detected' : 'max consecutive failures', isPermanentError);
      return;
    }

    this.scheduleReconnect();
  }

  private applyChange(change: StreamChange) {
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
      reportReachable();
    };

    eventSource.onopen = () => {
      console.debug(`[${this.name}] SSE connected, waiting for offset...`);
    };

    eventSource.addEventListener('change', (event) => {
      noteActivity();
      try {
        const change = JSON.parse(event.data);

        if (this.buffering) {
          if (this.bufferOverflowed) return;
          if (this.pendingChanges.length >= changeBufferCap) {
            this.bufferOverflowed = true;
            this.pendingChanges = [];
            return;
          }
          this.pendingChanges.push(change);
          return;
        }

        this.applyChange(change);
      } catch (error) {
        console.debug(`[${this.name}] Failed to parse change:`, error);
      }
    });

    // A signal is handled at once, also during catchup.
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

    eventSource.addEventListener('offset', () => {
      noteActivity();
      console.debug(`[${this.name}] SSE offset received`);
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
        // Any other end fails the stream as a transport error does, so a server that keeps ending it before catchup opens the circuit.
        if (!permanent) return this.handleStreamFailure(`Server stream error: ${payload.code}`);
        console.debug(`[${this.name}] Server stream error:`, payload);
        this.closeEventSource();
        this.store.getState().setState('error');
        this.openCircuit(`server error: ${payload.code}`, true);
      } catch {
        // Malformed payload, let onerror handle the eventual transport close.
      }
    });

    eventSource.onerror = () => this.handleStreamFailure('SSE error');

    this.eventSource = eventSource;
    this.lastEventAt = Date.now();
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
      this.openCircuit('max consecutive SSE failures');
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

  private openCircuit(reason: string, permanent = false) {
    this.circuitOpen = true;
    this.circuitOpenedAt = Date.now();
    this.circuitPermanent = permanent;
    console.warn(`[${this.name}] Circuit breaker opened:`, reason);
    // The stream stopped reconnecting until the cooldown ends: paused mutations replay through the API, which arbitrates them by their `replayed` stx.
    resolveInitialCatchupGate();

    // Cancel the pending reconnect so it cannot fire while the circuit is open.
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.scheduleCooldownCheck(circuitCooldownMs);
  }

  /** A tab that stays visible, or a hidden leader whose followers are in view, hears no visibilitychange: the end of the cooldown runs the same health-gated attempt. */
  private scheduleCooldownCheck(delay: number) {
    if (this.circuitPermanent) return;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      void this.attemptReconnect();
    }, delay);
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
      this.scheduleCooldownCheck(circuitCooldownMs - elapsed);
      return;
    }

    if (this.healthCheckInProgress) return;
    this.healthCheckInProgress = true;

    console.debug(`[${this.name}] Circuit cooldown elapsed, checking health`);

    // A disconnect or a forced reconnect while the check runs ends this connect cycle, and the answer with it.
    const cycle = this.abortController;
    try {
      const response = await fetch(healthUrl);
      if (this.abortController !== cycle) return;
      if (response.ok) {
        console.debug(`[${this.name}] Health check passed, reconnecting`);
        this.reconnect();
      } else {
        this.circuitOpenedAt = Date.now();
        this.scheduleCooldownCheck(circuitCooldownMs);
        console.debug(`[${this.name}] Health check failed, extending cooldown`);
      }
    } catch {
      if (this.abortController !== cycle) return;
      this.circuitOpenedAt = Date.now();
      this.scheduleCooldownCheck(circuitCooldownMs);
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

  /** Back online: reconnect now, past the backoff and an open circuit, as queries and paused mutations resume. */
  private startOnlineReconnect() {
    if (this.onlineUnsubscribe) return;
    let wasOnline = onlineManager.isOnline();
    this.onlineUnsubscribe = onlineManager.subscribe((online) => {
      const cameBack = online && !wasOnline;
      wasOnline = online;
      const shouldReconnect = !this.config.useTabCoordination || isLeader();
      if (cameBack && shouldReconnect && !this.isConnected() && !this.circuitPermanent) {
        console.debug(`[${this.name}] Back online, reconnecting...`);
        this.reconnect();
      }
    });
  }

  private stopOnlineReconnect() {
    this.onlineUnsubscribe?.();
    this.onlineUnsubscribe = null;
  }

  disconnect() {
    this.stop();
    resolveInitialCatchupGate();
  }

  /** Closes the stream and its reconnect handlers, and leaves the gate to the caller. */
  private stop() {
    this.stopVisibilityReconnect();
    this.stopLeaderReconnect();
    this.stopOnlineReconnect();

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
    this.circuitPermanent = false;
    this.circuitOpenedAt = null;
    this.connectedAt = null;
    this.currentBackoff = initialBackoffMs;
  }

  /** The connect that follows opens the gate, on its catchup, its failure or an open circuit, or at once in a follower. */
  reconnect() {
    this.resetCircuitBreaker();
    this.stop();
    this.connect();
  }
}

export const appStreamManager = new StreamManager('AppStream', {
  endpoint: `${appConfig.backendUrl}/entities/app/stream`,
  withCredentials: true,
  useTabCoordination: true,
  fetchAndProcessCatchup: async (signal) => {
    declareViewsFromMemberships();
    const views = syncStore.getState().getCatchupViews(getRegisteredProductEntityTypes());
    const response = await postAppCatchup({ body: { views: views.length > 0 ? views : undefined }, signal });
    signal.throwIfAborted();
    // Passed on before the leader processes it: followers fetch their gaps alongside the leader, and get the answer when its processing fails.
    if (isLeader()) broadcastCatchup(response);
    await processAppCatchup(response);
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

/** Mirrors the health of live delivery into the basic layer without a circular import: either fact enables time-based freshness. */
function applySyncHealth(health: SyncHealth): void {
  setSyncStreamHealthy(health.streamHealthy);
  setSyncWorkerAway(health.workerAway);
}

/** Takes the health of live delivery from this tab's own stream and tells the follower tabs when it changed. Of the stream only the `error` state counts: each reconnect runs a catchup. */
function publishSyncHealth(): void {
  if (!isLeader()) return;
  const health: SyncHealth = { streamHealthy: appStreamManager.store.getState().state !== 'error', workerAway };
  applySyncHealth(health);
  broadcastSyncHealth(health);
}

appStreamManager.store.subscribe(publishSyncHealth);
// A follower takes the leader's word. Once it leads, its own stream connects and says, whatever it last heard.
onSyncHealth((health) => {
  if (!isLeader()) applySyncHealth(health);
});

/**
 * Resolves once a leader's catchup completes after page load or a sign-in, or fails; at once in a follower tab; and when
 * the stream gives up or disconnects. A reconnect opens nothing itself. Safe to call before any stream connects.
 */
export function waitForActiveCatchup(): Promise<void> {
  return initialCatchupGate;
}

/** Resumes a restored queue after catchup so replays read reconciled data; no blanket invalidation, since that would refetch every cached list. */
export function resumeRestoredMutations(): void {
  void waitForActiveCatchup().then(() => queryClient.resumePausedMutations());
}

// A sign-in closes the gate for the queue it restores, and clears the circuit the lost session's 401 left open.
subscribeLocalUserChange((userId) => {
  if (!userId) return;
  closeInitialCatchupGate();
  appStreamManager.resetCircuitBreaker();
});
