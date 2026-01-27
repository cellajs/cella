import type { Attachment, Page, TxStreamMessage } from '~/api.gen';
import type { ContextEntityDataWithMembership } from '~/modules/me/types';

// ================================
// Shared stream types
// ================================

/** Stream connection state (shared by all stream hooks). */
export type StreamState = 'disconnected' | 'connecting' | 'catching-up' | 'live' | 'error';

/** @deprecated Use StreamState instead. Alias for backwards compatibility. */
export type UserStreamState = StreamState;

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

/** Transaction metadata in stream messages. */
export type StreamTx = NonNullable<TxStreamMessage>;

/**
 * Single message from user stream (membership, organization, and product entity events).
 * Supports both legacy data-push format and new notification format.
 */
export interface UserStreamMessage {
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
  /** Full entity data (legacy format, may be null in notification format) */
  data?: ContextEntityDataWithMembership | ProductEntityData | null;
  /** Transaction metadata for conflict detection. */
  tx?: StreamTx | null;
  /** Fields that were changed (legacy format). */
  changedKeys?: string[] | null;
  /** Scoped sequence number for gap detection (notification format). */
  seq?: number;
  /** Trace context for end-to-end correlation. */
  _trace?: StreamTraceContext;
}

/** Offset event from SSE (signals end of catch-up). */
export interface UserStreamOffsetEvent {
  cursor: string | null;
}

/** Options for useUserStream hook. */
export interface UseUserStreamOptions {
  /** Starting offset: 'now' for live-only, '-1' for full history, or activity ID. */
  initialOffset?: string | null;
  /** Callback when a stream message is received. */
  onMessage?: (message: UserStreamMessage) => void;
  /** Callback when catch-up is complete. */
  onCatchUpComplete?: (cursor: string | null) => void;
  /** Callback on connection state change. */
  onStateChange?: (state: StreamState) => void;
  /** Whether the stream is enabled. Default: true */
  enabled?: boolean;
  /**
   * Whether initial data hydration is complete.
   * When false, stream messages are queued to prevent race conditions.
   * When true (or undefined), queued messages are flushed and processed.
   * Default: true (no barrier, backwards compatible)
   */
  isHydrated?: boolean;
}

/** Return value from useUserStream hook. */
export interface UseUserStreamReturn {
  /** Current connection state. */
  state: StreamState;
  /** Last known cursor (activity ID). */
  cursor: string | null;
  /** Manually reconnect. */
  reconnect: () => void;
  /** Manually disconnect. */
  disconnect: () => void;
}
