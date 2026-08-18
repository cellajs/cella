import WebSocket from 'ws';
import { env } from '../env';
import { log } from '../lib/pino';

const WS_OPEN = 1;

const MAX_RECONNECT_DELAY_MS = 30_000;

const BASE_RECONNECT_DELAY_MS = 1_000;

const PING_INTERVAL_MS = 30_000;

/** Grace period in ms during which dev reconnects are not logged. */
const DEV_RECONNECT_GRACE_MS = 10_000;

type WebSocketState = 'connecting' | 'open' | 'closed' | 'reconnecting';

interface WebSocketClientCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Server-to-server channel from the CDC worker to the backend `/internal/cdc` endpoint, carrying full
 * entity row data. Guarded by shared-secret auth and (in production) loopback-only enforcement, so it
 * must never be reachable from external networks or browser clients. Reconnects with backoff + jitter.
 */
class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempt = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private callbacks: WebSocketClientCallbacks = {};

  private _state: WebSocketState = 'closed';
  private _lastMessageAt: Date | null = null;
  private _messagesSent = 0;
  private _disconnectedAt: Date | null = null;

  constructor(url: string) {
    this.url = url;
  }

  setCallbacks(callbacks: WebSocketClientCallbacks): void {
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this._state === 'connecting' || this._state === 'open') {
      return;
    }

    this._state = 'connecting';

    const headers: Record<string, string> = {
      'x-cdc-secret': env.CDC_SECRET,
    };

    if (!this.inGracePeriod()) {
      log.info('CDC WebSocket connecting...', { url: this.url, attempt: this.reconnectAttempt + 1 });
    }

    this.ws = new WebSocket(this.url, { headers });

    this.ws.on('open', () => {
      this._state = 'open';
      this._disconnectedAt = null;
      this.reconnectAttempt = 0;

      log.info('CDC WebSocket connected');

      this.startPingInterval();

      this.callbacks.onConnect?.();
    });

    this.ws.on('close', (code, reason) => {
      if (!this.inGracePeriod()) {
        log.info('CDC WebSocket closed', { code, reason: reason.toString() });
      }
      this.handleDisconnect();
    });

    this.ws.on('error', (error) => {
      if (!this.inGracePeriod()) {
        log.warn('CDC WebSocket error', { err: error });
      }
      // No handleDisconnect here: a 'close' event always follows.
    });

    this.ws.on('pong', () => {
      log.trace('CDC WebSocket pong received');
    });
  }

  /** @returns false when not connected or serialization failed. */
  send(data: unknown): boolean {
    if (!this.isConnected()) {
      if (!this.inGracePeriod()) {
        log.warn('CDC WebSocket not connected, cannot send message');
      }
      return false;
    }

    try {
      const message = JSON.stringify(data);
      this.ws?.send(message);
      this._messagesSent++;
      this._lastMessageAt = new Date();
      return true;
    } catch (error) {
      log.error('CDC WebSocket send error', { err: error });
      return false;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WS_OPEN;
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

  /** @returns null while connected. */
  getDisconnectedDuration(): number | null {
    if (!this._disconnectedAt) return null;
    return Date.now() - this._disconnectedAt.getTime();
  }

  /** Development only: suppresses reconnect logging for the first seconds after a disconnect. */
  inGracePeriod(): boolean {
    if (env.NODE_ENV !== 'development') return false;
    const duration = this.getDisconnectedDuration();
    return duration !== null && duration < DEV_RECONNECT_GRACE_MS;
  }

  close(): void {
    this.cleanup();
    this.ws?.close();
    this.ws = null;
    this._state = 'closed';
  }

  private handleDisconnect(): void {
    this.cleanup();

    const wasConnected = this._state === 'open';
    this._state = 'reconnecting';

    // Only the initial disconnect stamps disconnectedAt; reconnect failures keep the original.
    if (!this._disconnectedAt) {
      this._disconnectedAt = new Date();
    }

    if (wasConnected) {
      this.callbacks.onDisconnect?.();
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    // min(30s, 1s * 2^attempt)
    const exponentialDelay = Math.min(MAX_RECONNECT_DELAY_MS, BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt);

    // Jitter: ±20%
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.round(exponentialDelay + jitter);

    this.reconnectAttempt++;

    if (!this.inGracePeriod()) {
      log.info('CDC WebSocket scheduling reconnect', {
        attempt: this.reconnectAttempt,
        delayMs: delay,
      });
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  private startPingInterval(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WS_OPEN) {
        this.ws.ping();
      }
    }, PING_INTERVAL_MS);
  }

  private cleanup(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

export const wsClient = new WebSocketClient(env.API_WS_URL);
