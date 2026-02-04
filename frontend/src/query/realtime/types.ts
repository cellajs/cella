import type { StreamNotification } from '~/api.gen';

/** Stream connection state. */
export type StreamState = 'disconnected' | 'connecting' | 'catching-up' | 'live' | 'error';

/** Base options for stream hooks. */
export interface BaseStreamOptions {
  enabled?: boolean;
  initialOffset?: string | null;
  onCatchUpComplete?: (cursor: string | null) => void;
  onStateChange?: (state: StreamState) => void;
  /** When false, notifications are queued until hydration completes. */
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

/** App stream notification with optional trace context for debugging. */
export type AppStreamNotification = StreamNotification & {
  _trace?: StreamTraceContext;
};

/** Options for useAppStream hook. */
export interface UseAppStreamOptions extends BaseStreamOptions {
  onNotification?: (notification: AppStreamNotification) => void;
}

/** Return value for useAppStream hook. */
export type UseAppStreamReturn = BaseStreamReturn;

/** Options for usePublicStream hook. */
export type UsePublicStreamOptions = Pick<BaseStreamOptions, 'enabled' | 'onStateChange'>;

/** Return value for usePublicStream hook. */
export type UsePublicStreamReturn = BaseStreamReturn;
