import type { Notification, Pool, PoolClient } from 'pg';
import { baseDb } from '#/db/db';
import { env } from '#/env';
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

interface ListenOptions {
  /** How often the LISTEN is repeated to check the connection. */
  heartbeatMs?: number;
  /** How long a heartbeat may go unanswered before the connection counts as lost. */
  heartbeatTimeoutMs?: number;
}

/** Only a pool hands out a connection of its own; drizzle builds `baseDb` on one. */
const isPool = (client: typeof baseDb.$client): client is Pool => 'totalCount' in client;

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

  const dbClient = baseDb.$client;
  if (!isPool(dbClient)) throw new Error('The auth invalidation listener needs the pooled database client');
  const pool: Pool = dbClient;

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
    drop(lost);
    log.warn('Auth invalidation listener lost its connection, reconnecting', { error });
    scheduleConnect();
  }

  /** Repeats the LISTEN; a failure, or no answer within the timeout, loses the connection. */
  async function beat(listening: PoolClient) {
    let failure = new Error(`The heartbeat LISTEN got no answer within ${heartbeatTimeoutMs} ms`);
    const answer = listening.query(listenStatement).catch((error: Error) => {
      failure = error;
      throw error;
    });
    if (!(await withinTimeout(answer, heartbeatTimeoutMs)) && client === listening) onLost(failure);
  }

  async function connect() {
    let next: PoolClient | undefined;
    try {
      next = await pool.connect();
      next.on('notification', onNotification);
      next.on('error', onLost);
      next.on('end', onLost);
      // An unanswered LISTEN fails the connect too: nothing else would start the heartbeat or schedule a retry.
      let failure: unknown = new Error(`The LISTEN got no answer within ${heartbeatTimeoutMs} ms`);
      const listening = next.query(listenStatement).catch((error: unknown) => {
        failure = error;
        throw error;
      });
      if (!(await withinTimeout(listening, heartbeatTimeoutMs))) throw failure;
      if (stopped) return drop(next);
      client = next;
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

  void connect();

  stopListening = async () => {
    stopped = true;
    stopListening = null;
    if (retryTimer) clearTimeout(retryTimer);
    if (heartbeat) clearInterval(heartbeat);
    const current = client;
    client = null;
    if (current) drop(current);
  };
  return stopListening;
}
