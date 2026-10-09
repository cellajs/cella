import WebSocket from 'ws';
import { env } from '../env';
import { log } from '../lib/pino';
import { ApiUnreachableError } from '../services/failure';

const WS_OPEN = 1;

/** A flush waits for this socket, so the wait for the next attempt stays short. */
const MAX_RECONNECT_DELAY_MS = 5_000;

const BASE_RECONNECT_DELAY_MS = 1_000;

type WebSocketState = 'connecting' | 'open' | 'closed' | 'reconnecting';

/**
 * Server-to-server channel from the CDC worker to the API's `/internal/cdc` endpoint, carrying full
 * entity row data. The listener admits private-network and loopback peers only and the route checks the
 * shared secret, so it is never reachable from external networks or browser clients. Connects again with
 * a backoff and jitter. The worker's health push is its traffic: the API closes a socket it hears nothing
 * from for 90 seconds.
 */
class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempt = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  /** Flushes waiting for the socket: resolved when it opens, rejected when the client is closed for good. */
  private waiters: { resolve: () => void; reject: (error: Error) => void }[] = [];

  private _state: WebSocketState = 'closed';
  private _lastMessageAt: Date | null = null;
  private _messagesSent = 0;
  private _apiAwaySince: Date | null = null;
  /** Set by `close()`: the worker is shutting down. */
  private closedForGood = false;

  /** Called each time a connection opens, before the flushes that waited for it go on. */
  onOpen: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this._state === 'connecting' || this._state === 'open') {
      return;
    }
    this.closedForGood = false;

    this._state = 'connecting';

    const headers: Record<string, string> = { 'x-cdc-secret': env.CDC_SECRET };

    log.debug('Connecting to the API', { url: this.url, attempt: this.reconnectAttempt + 1 });

    this.ws = new WebSocket(this.url, { headers });

    this.ws.on('open', () => {
      this._state = 'open';
      this._apiAwaySince = null;
      this.reconnectAttempt = 0;

      // The boot smoke of the `verify` skill looks for the second half of this line in the log.
      log.info('API reachable');

      this.onOpen?.();
      for (const waiter of this.waiters.splice(0)) waiter.resolve();
    });

    this.ws.on('close', (code, reason) => {
      log.debug('Socket to the API closed', { code, reason: reason.toString() });
      this.handleDisconnect();
    });

    this.ws.on('error', (error) => {
      // No handleDisconnect here: a 'close' event always follows.
      log.debug('Socket to the API failed', { err: error });
    });
  }

  /**
   * Sends one message to the API.
   * @throws `ApiUnreachableError` when no connection is open: a passing failure. Data that cannot be serialized
   *   throws the serializer's own error, which counts against the change.
   */
  send(data: unknown): void {
    if (!this.isConnected()) throw new ApiUnreachableError();
    this.ws?.send(JSON.stringify(data));
    this._messagesSent++;
    this._lastMessageAt = new Date();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WS_OPEN;
  }

  /**
   * Resolves once the socket is open, at once when it already is. The worker hands every change to the API, so a
   * flush waits here while the API is away and the changes stay in the WAL. Rejects when the client is closed.
   */
  whenConnected(): Promise<void> {
    if (this.isConnected()) return Promise.resolve();
    if (this._state === 'closed' && this.closedForGood) return Promise.reject(new ApiUnreachableError());
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  get state(): WebSocketState {
    return this._state;
  }

  get lastMessageAt(): Date | null {
    return this._lastMessageAt;
  }

  get messagesSent(): number {
    return this._messagesSent;
  }

  /**
   * Since when the API is away: from the moment an open connection closed, or from the first attempt that failed
   * when none was open yet. Null while a connection is open, and before the first attempt ended.
   */
  get apiAwaySince(): Date | null {
    return this._apiAwaySince;
  }

  close(): void {
    this.closedForGood = true;
    this.clearReconnect();
    this.ws?.close();
    this.ws = null;
    this._state = 'closed';
    for (const waiter of this.waiters.splice(0)) waiter.reject(new ApiUnreachableError());
  }

  private handleDisconnect(): void {
    this.clearReconnect();
    // A deliberate close also fires this event: nothing connects again after it.
    if (this.closedForGood) return;

    this._state = 'reconnecting';

    // Attempts that fail during an outage keep its first moment.
    if (!this._apiAwaySince) {
      this._apiAwaySince = new Date();
      log.warn('API away: flushes wait and the WAL keeps the changes');
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    // min(5s, 1s * 2^attempt)
    const exponentialDelay = Math.min(MAX_RECONNECT_DELAY_MS, BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt);

    // Jitter: ±20%
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.round(exponentialDelay + jitter);

    this.reconnectAttempt++;

    log.debug('Next attempt to connect to the API scheduled', { attempt: this.reconnectAttempt, delayMs: delay });

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}

/** The socket's address: the internal listener's `/internal/cdc` route, over the WebSocket scheme matching the listener's. */
const cdcSocketUrl = new URL('/internal/cdc', env.BACKEND_INTERNAL_URL);
cdcSocketUrl.protocol = cdcSocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';

/** The worker's one socket to the API. It also keeps the one fact "the API is away", as `apiAwaySince`. */
export const wsClient = new WebSocketClient(cdcSocketUrl.href);
