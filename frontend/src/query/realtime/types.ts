import type { StreamNotification } from 'sdk';
import type { ProductEntityType } from 'shared';

/** Stream connection state. */
export type StreamState = 'disconnected' | 'connecting' | 'catching-up' | 'live' | 'error';

/** Base options for stream hooks. */
interface BaseStreamOptions {
  enabled?: boolean;
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

/**
 * Product-entity notification for the seq/cacheToken sync path. `entityType` is
 * non-null when `kind === 'entity'`.
 */
export type EntityNotification = StreamNotification & { kind: 'entity'; entityType: ProductEntityType };

/** Membership notification for the query-invalidation path. */
export type MembershipNotification = StreamNotification & { kind: 'membership'; resourceType: 'membership' };

/**
 * App stream notification with optional trace context for debugging.
 * Discriminated on `kind` so entity vs membership branches are exhaustive and
 * the compiler proves which fields are present in each.
 */
export type AppStreamNotification = (EntityNotification | MembershipNotification) & {
  _trace?: StreamTraceContext;
};

/** Options for useAppStream hook. */
export interface UseAppStreamOptions extends BaseStreamOptions {}

/** Return value for useAppStream hook. */
export type UseAppStreamReturn = BaseStreamReturn;
