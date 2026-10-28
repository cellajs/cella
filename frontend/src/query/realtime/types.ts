import type { StreamChange } from 'sdk';

export type StreamState = 'disconnected' | 'connecting' | 'catching-up' | 'live' | 'error';

/** Trace context propagated from CDC Worker (debug mode only). */
export interface StreamTraceContext {
  traceId: string;
  spanId: string;
  cdcTimestamp: number;
  lsn?: string;
}

/** A change frame as the client handles it: product rows only, with the worker's trace in debug mode. */
export type AppStreamChange = StreamChange & { _trace?: StreamTraceContext };
