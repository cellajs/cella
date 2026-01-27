import type { Attachment, Page, TxBase } from '~/api.gen';

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
export type StreamTx = NonNullable<TxBase>;

/**
 * Single notification from app stream (membership, organization, and product entity events).
 * Supports both legacy data-push format and new notification format.
 */
export interface AppStreamMessage {
  /** Activity ID (legacy format only) */
  activityId?: string;
  action: 'create' | 'update' | 'delete';
  entityType: string;
  /** Resource type for membership events (legacy format) */
  resourceType?: string | null;
  entityId: string;
  organizationId: string | null;
  /** Timestamp (legacy format only) */
  createdAt?: string;
  /** Transaction metadata for conflict detection. */
  tx?: StreamTx | null;
  /** Fields that were changed (legacy format). */
  changedKeys?: string[] | null;
  /** Scoped sequence number for gap detection (notification format). */
  seq?: number;
  /**
   * Cache token for LRU entity cache access (notification format).
   * Pass this in X-Cache-Token header when fetching the entity.
   * The first client to fetch populates the cache; subsequent clients get cache hits.
   */
  cacheToken?: string;
  /** Trace context for end-to-end correlation. */
  _trace?: StreamTraceContext;
}

/** Offset event from SSE (signals end of catch-up). */
export interface AppStreamOffsetEvent {
  cursor: string | null;
}

/** Options for useAppStream hook. */
export interface UseAppStreamOptions extends BaseStreamOptions {
  /** Callback when a stream notification is received. */
  onMessage?: (message: AppStreamMessage) => void;
}

/** Return value from useAppStream hook. */
export type UseAppStreamReturn = BaseStreamReturn;

/** Options for usePublicStream hook. */
export type UsePublicStreamOptions = BaseStreamOptions;

/** Return value from usePublicStream hook. */
export type UsePublicStreamReturn = BaseStreamReturn;
