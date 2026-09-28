import type { Notification, PoolClient } from 'pg';
import { openDedicatedConnection } from '#/db/db';
import { env } from '#/env';
import type { HealthComponent } from '#/lib/health-helpers';
import { log } from '#/utils/logger';
import { withinTimeout } from '#/utils/within-timeout';
import { authInvalidateChannel, clearCachedAuth, dropCachedAuth, parseAuthInvalidation } from './invalidate-cache';

const listenStatement = `LISTEN ${authInvalidateChannel}`;
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/** A silently dropped connection hears nothing; repeating the LISTEN finds out within this. */
const HEARTBEAT_MS = 60_000;
/** A heartbeat without an answer in this long means the connection is gone, whether or not its socket said so. */
const HEARTBEAT_TIMEOUT_MS = 10_000;

let stopListening: (() => Promise<void>) | null = null;

/** What the listener is doing; only `listening` hears the other processes, `connecting` covers every (re)connect. */
type ListenerState = 'never_started' | 'connecting' | 'listening' | 'stopped';
let state: ListenerState = 'never_started';

/**
 * This process's listener as a health component: a process that hears no invalidations serves ended sessions and
 * removed memberships from its caches, so only `listening` is healthy. Between connections it is degraded; before the
 * first start or after stop it is unhealthy.
 * @returns The component, with the state as the reason while not listening.
 */
export function authInvalidationHealth(): HealthComponent {
  const status = state === 'listening' ? 'healthy' : state === 'connecting' ? 'degraded' : 'unhealthy';
  return { status, checkedVia: 'local', ...(status === 'healthy' ? {} : { reason: state }) };
}

interface ListenOptions {
  /** How often the LISTEN is repeated to check the connection. */
  heartbeatMs?: number;
  /** How long a heartbeat may go unanswered before the connection counts as lost. */
  heartbeatTimeoutMs?: number;
}

/**
 * LISTENs on `auth_invalidate` over one connection taken from the pool and drops what each message names from this
 * process's guard caches, so a session ending or a membership change in one process reaches the api, mcp and oauth
 * processes. Reconnects with backoff, and every (re)connect clears the guard caches: messages sent while no connection
 * listened are gone. One listener per process, also when singleVM runs the three in one.
 *
 * @param options - The heartbeat timing; the defaults suit production.
 * @returns Stops listening and closes the connection.
 */
export function listenForAuthInvalidation({
  heartbeatMs = HEARTBEAT_MS,
  heartbeatTimeoutMs = HEARTBEAT_TIMEOUT_MS,
}: ListenOptions = {}): () => Promise<void> {
  if (stopListening) return stopListening;
  if (env.NODB) return async () => {};

  let client: PoolClient | null = null;
  let stopped = false;
  let retryDelay = RETRY_MIN_MS;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const onNotification = (message: Notification) => {
    if (message.channel !== authInvalidateChannel || !message.payload) return;
    const invalidation = parseAuthInvalidation(message.payload);
    if (invalidation) dropCachedAuth(invalidation);
    else log.warn('Ignored a malformed auth invalidation', { payload: message.payload });
  };

  /** Closes the connection for good: a LISTENing client never goes back to the pool. */
  const drop = (lost: PoolClient) => {
    lost.off('notification', onNotification);
    lost.off('error', onLost);
    lost.off('end', onLost);
    // A late socket error from the closing connection must not surface as an unhandled 'error' event.
    lost.on('error', () => {});
    lost.release(true);
  };

  const scheduleConnect = () => {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, retryDelay);
    retryTimer.unref();
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  };

  function onLost(error?: Error) {
    const lost = client;
    client = null;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    if (!lost) return;
    state = 'connecting';
    drop(lost);
    log.warn('Auth invalidation listener lost its connection, reconnecting', { error });
    scheduleConnect();
  }

  /** Repeats the LISTEN; a failure, or no answer within the timeout, loses the connection. */
  async function beat(listening: PoolClient) {
    const failure = await withinTimeout(listening.query(listenStatement), heartbeatTimeoutMs, 'The heartbeat LISTEN');
    if (failure && client === listening) onLost(failure);
  }

  async function connect() {
    let next: PoolClient | undefined;
    try {
      next = await openDedicatedConnection(onLost);
      next.on('notification', onNotification);
      next.on('end', onLost);
      // An unanswered LISTEN fails the connect too: nothing else would start the heartbeat or schedule a retry.
      const failure = await withinTimeout(next.query(listenStatement), heartbeatTimeoutMs, 'The LISTEN');
      if (failure) throw failure;
      if (stopped) return drop(next);
      client = next;
      state = 'listening';
      retryDelay = RETRY_MIN_MS;
      // Any entry cached while nothing listened may have missed its invalidation.
      clearCachedAuth();
      heartbeat = setInterval(() => {
        if (client) void beat(client);
      }, heartbeatMs);
      heartbeat.unref();
    } catch (error) {
      if (next && next !== client) drop(next);
      log.warn('Auth invalidation listener failed to connect, retrying', { error });
      scheduleConnect();
    }
  }

  state = 'connecting';
  void connect();

  stopListening = async () => {
    stopped = true;
    state = 'stopped';
    stopListening = null;
    if (retryTimer) clearTimeout(retryTimer);
    if (heartbeat) clearInterval(heartbeat);
    const current = client;
    client = null;
    if (current) drop(current);
  };
  return stopListening;
}
