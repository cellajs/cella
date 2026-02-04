import type { Attachment, Page, StreamNotification, TxStreamMessage } from '~/api.gen';

// --- Shared stream types (used by app stream and public stream) ---

/** Stream connection state. */
export type StreamState = 'disconnected' | 'connecting' | 'catching-up' | 'live' | 'error';

/** Base options for stream hooks. */
export interface BaseStreamOptions {
  enabled?: boolean;
  initialOffset?: string | null;
  onCatchUpComplete?: (cursor: string | null) => void;
  onStateChange?: (state: StreamState) => void;
  /** When false, notifications are queued until hydration completes. Default: true */
  isHydrated?: boolean;
}

/** Base return value for stream hooks. */
export interface BaseStreamReturn {
  state: StreamState;
  cursor: string | null;
  reconnect: () => void;
  disconnect: () => void;
}

/** Trace context propagated from CDC Worker (debug mode only). */
export interface StreamTraceContext {
  traceId: string;
  spanId: string;
  cdcTimestamp: number;
  lsn?: string;
}

// --- App stream specific types ---

/** Product entity data union. */
export type ProductEntityData = Page | Attachment;

/** Transaction metadata in stream notifications. */
export type StreamTx = NonNullable<TxStreamMessage>;

/** Notification from app stream with optional trace context. */
export type AppStreamNotification = StreamNotification & {
  _trace?: StreamTraceContext;
};

/** Offset event from SSE (signals end of catch-up). */
export interface AppStreamOffsetEvent {
  cursor: string | null;
}

/** Options for useAppStream hook. */
export interface UseAppStreamOptions extends BaseStreamOptions {
  onNotification?: (notification: AppStreamNotification) => void;
}

/** Return value from useAppStream hook. */
export type UseAppStreamReturn = BaseStreamReturn;

// --- Public stream specific types ---

/** Options for usePublicStream hook. */
export type UsePublicStreamOptions = Pick<BaseStreamOptions, 'enabled' | 'onStateChange'>;

/** Return value from usePublicStream hook. */
export type UsePublicStreamReturn = BaseStreamReturn;
