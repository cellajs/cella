import WebSocket from 'ws';
import { env } from './env';
import { logEvent } from '#/utils/logger';

/** WebSocket ready states */
const WS_OPEN = 1;

/** Maximum reconnect delay in milliseconds */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Base reconnect delay in milliseconds */
const BASE_RECONNECT_DELAY_MS = 1_000;

/** Ping interval in milliseconds */
const PING_INTERVAL_MS = 30_000;

/**
 * WebSocket connection state.
 */
export type WsState = 'connecting' | 'open' | 'closed' | 'reconnecting';

/**
 * Callbacks for WebSocket state changes.
 */
interface WebSocketClientCallbacks {
  /** Called when connection is established */
  onConnect?: () => void;
  /** Called when connection is lost */
  onDisconnect?: () => void;
}

/**
 * WebSocket client for CDC Worker to connect to API server.
 * Implements exponential backoff with jitter for reconnection.
 */
class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempt = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private callbacks: WebSocketClientCallbacks = {};

  // State tracking
  private _wsState: WsState = 'closed';
  private _lastMessageAt: Date | null = null;
  private _messagesSent = 0;
  private _disconnectedAt: Date | null = null;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Set callbacks for connection state changes.
   */
  setCallbacks(callbacks: WebSocketClientCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Connect to the WebSocket server.
   */
  connect(): void {
    if (this._wsState === 'connecting' || this._wsState === 'open') {
      return;
    }

    this._wsState = 'connecting';

    const headers: Record<string, string> = {};
    if (env.CDC_INTERNAL_SECRET) {
      headers['x-cdc-secret'] = env.CDC_INTERNAL_SECRET;
    }

    logEvent('info', 'CDC WebSocket connecting...', { url: this.url, attempt: this.reconnectAttempt + 1 });

    this.ws = new WebSocket(this.url, { headers });

    this.ws.on('open', () => {
      this._wsState = 'open';
      this._disconnectedAt = null;
      this.reconnectAttempt = 0; // Reset backoff on successful connection

      logEvent('info', 'CDC WebSocket connected');

      // Start ping interval to keep connection alive
      this.startPingInterval();

      this.callbacks.onConnect?.();
    });

    this.ws.on('close', (code, reason) => {
      logEvent('info', 'CDC WebSocket closed', { code, reason: reason.toString() });
      this.handleDisconnect();
    });

    this.ws.on('error', (error) => {
      logEvent('error', 'CDC WebSocket error', { error: error.message });
      // Don't call handleDisconnect here - 'close' event will follow
    });

    this.ws.on('pong', () => {
      // Connection is alive
      logEvent('debug', 'CDC WebSocket pong received');
    });
  }

  /**
   * Send a message to the API server.
   * @returns true if sent successfully, false if not connected
   */
  send(data: unknown): boolean {
    if (!this.isConnected()) {
      logEvent('warn', 'CDC WebSocket not connected, cannot send message');
      return false;
    }

    try {
      const message = JSON.stringify(data);
      this.ws?.send(message);
      this._messagesSent++;
      this._lastMessageAt = new Date();
      return true;
    } catch (error) {
      logEvent('error', 'CDC WebSocket send error', { error });
      return false;
    }
  }

  /**
   * Check if WebSocket is connected and ready to send.
   */
  isConnected(): boolean {
    return this.ws?.readyState === WS_OPEN;
  }

  /**
   * Get current WebSocket state.
   */
  get wsState(): WsState {
    return this._wsState;
  }

  /**
   * Get last message timestamp.
   */
  get lastMessageAt(): Date | null {
    return this._lastMessageAt;
  }

  /**
   * Get total messages sent.
   */
  get messagesSent(): number {
    return this._messagesSent;
  }

  /**
   * Get time since disconnect in milliseconds, or null if connected.
   */
  getDisconnectedDuration(): number | null {
    if (!this._disconnectedAt) return null;
    return Date.now() - this._disconnectedAt.getTime();
  }

  /**
   * Close the WebSocket connection.
   */
  close(): void {
    this.cleanup();
    this.ws?.close();
    this.ws = null;
    this._wsState = 'closed';
  }

  /**
   * Handle disconnect and schedule reconnection.
   */
  private handleDisconnect(): void {
    this.cleanup();

    const wasConnected = this._wsState === 'open';
    this._wsState = 'reconnecting';
    this._disconnectedAt = new Date();

    if (wasConnected) {
      this.callbacks.onDisconnect?.();
    }

    this.scheduleReconnect();
  }

  /**
   * Schedule a reconnection attempt with exponential backoff and jitter.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    // Calculate delay with exponential backoff: min(30s, 1s * 2^attempt)
    const exponentialDelay = Math.min(MAX_RECONNECT_DELAY_MS, BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt);

    // Add jitter: ±20%
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.round(exponentialDelay + jitter);

    this.reconnectAttempt++;

    logEvent('info', 'CDC WebSocket scheduling reconnect', {
      attempt: this.reconnectAttempt,
      delayMs: delay,
    });

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  /**
   * Start sending periodic pings.
   */
  private startPingInterval(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WS_OPEN) {
        this.ws.ping();
      }
    }, PING_INTERVAL_MS);
  }

  /**
   * Clean up timers.
   */
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

/** Singleton WebSocket client instance */
export const wsClient = new WebSocketClient(env.API_WS_URL);
