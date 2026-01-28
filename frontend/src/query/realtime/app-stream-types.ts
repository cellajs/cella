import type { Attachment, Page, StreamNotification, TxStreamMessage } from '~/api.gen';

// ================================
// Shared stream types
// ================================

/** Stream connection state (shared by all stream hooks). */
export type StreamState = 'disconnected' | 'connecting' | 'catching-up' | 'live' | 'error';

/** Base options shared by all stream hooks. */
export interface BaseStreamOptions {
  /** Whether the stream is enabled. Default: true */
  enabled?: boolean;
  /** Starting offset: 'now' for live-only, '-1' for full history, or activity ID. */
  initialOffset?: string | null;
  /** Callback when catch-up is complete. */
  onCatchUpComplete?: (cursor: string | null) => void;
  /** Callback on connection state change. */
  onStateChange?: (state: StreamState) => void;
  /**
   * Whether initial data hydration is complete.
   * When false, stream notifications are queued to prevent race conditions.
   * When true (or undefined), queued notifications are flushed and processed.
   * Default: true (no barrier, backwards compatible)
   */
  isHydrated?: boolean;
}

/** Base return value shared by all stream hooks. */
export interface BaseStreamReturn {
  /** Current connection state. */
  state: StreamState;
  /** Last known cursor (activity ID). */
  cursor: string | null;
  /** Manually reconnect. */
  reconnect: () => void;
  /** Manually disconnect. */
  disconnect: () => void;
}

// ================================
// Trace context for end-to-end correlation
// ================================

/** Trace context propagated from CDC Worker through backend. */
export interface StreamTraceContext {
  traceId: string;
  spanId: string;
  cdcTimestamp: number;
  lsn?: string;
}

// ================================
// User stream specific types
// ================================

/** Product entity data union (page, attachment, etc). */
export type ProductEntityData = Page | Attachment;

/** Transaction metadata in stream notifications. */
export type StreamTx = NonNullable<TxStreamMessage>;

/**
 * Single notification from app stream.
 * Uses the generated StreamNotification type with optional trace context.
 * No entity data is included - client fetches data via API if needed.
 */
export type AppStreamNotification = StreamNotification & {
  /** Trace context for end-to-end correlation (debug mode only). */
  _trace?: StreamTraceContext;
};

/** Offset event from SSE (signals end of catch-up). */
export interface AppStreamOffsetEvent {
  cursor: string | null;
}

/** Options for useAppStream hook. */
export interface UseAppStreamOptions extends BaseStreamOptions {
  /** Callback when a stream notification is received. */
  onNotification?: (notification: AppStreamNotification) => void;
}

/** Return value from useAppStream hook. */
export type UseAppStreamReturn = BaseStreamReturn;

/** Options for usePublicStream hook. */
export type UsePublicStreamOptions = BaseStreamOptions;

/** Return value from usePublicStream hook. */
export type UsePublicStreamReturn = BaseStreamReturn;
