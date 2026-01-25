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
// User stream specific types
// ================================

/** Product entity data union (page, attachment, etc). */
export type ProductEntityData = Page | Attachment;

/** Transaction metadata in stream messages. */
export type StreamTx = NonNullable<TxStreamMessage>;

/** Single message from user stream (membership, organization, and product entity events). */
export interface UserStreamMessage {
  activityId: string;
  action: 'create' | 'update' | 'delete';
  entityType: string;
  resourceType: string | null;
  entityId: string;
  organizationId: string | null;
  createdAt: string;
  data: ContextEntityDataWithMembership | ProductEntityData | null;
  /** Transaction metadata for conflict detection. */
  tx?: StreamTx | null;
  /** Fields that were changed (for partial updates). */
  changedKeys?: string[] | null;
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
