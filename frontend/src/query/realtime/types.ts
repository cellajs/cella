import type { StreamNotification } from 'sdk';
import type { ProductEntityType } from 'shared';

export type StreamState = 'disconnected' | 'connecting' | 'catching-up' | 'live' | 'error';

interface BaseStreamOptions {
  enabled?: boolean;
}

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

/** Seq sync path notification: `productType` is non-null when `kind === 'product'`. */
export type EntityNotification = StreamNotification & { kind: 'product'; productType: ProductEntityType };

/** Membership notification for the query-invalidation path. */
export type MembershipNotification = StreamNotification & { kind: 'membership'; resourceType: 'membership' };

/** Discriminated on `kind`, so the entity and membership branches are exhaustive and the compiler proves which fields each carries. */
export type AppStreamNotification = (EntityNotification | MembershipNotification) & {
  _trace?: StreamTraceContext;
};

export interface UseAppStreamOptions extends BaseStreamOptions {}

export type UseAppStreamReturn = BaseStreamReturn;
