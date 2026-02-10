import type { StreamNotification } from '~/api.gen';

/** Stream connection state. */
export type StreamState = 'disconnected' | 'connecting' | 'catching-up' | 'live' | 'error';

/** Base options for stream hooks. */
export interface BaseStreamOptions {
  enabled?: boolean;
  onStateChange?: (state: StreamState) => void;
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
export interface UseAppStreamOptions extends BaseStreamOptions {}

/** Return value for useAppStream hook. */
export type UseAppStreamReturn = BaseStreamReturn;
