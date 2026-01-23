import type { SyncStreamResponse, TxStreamMessage } from '~/api.gen';

/** Single activity from catch-up response - the canonical stream message type. */
export type StreamMessage = SyncStreamResponse['activities'][number];

/** Transaction metadata in stream messages (non-nullable variant of TxStreamMessage). */
export type StreamTx = NonNullable<TxStreamMessage>;

/** Activity actions aligned with HTTP methods (excluding 'read'). */
export type ActivityAction = StreamMessage['action'];

/** Offset event from SSE (signals end of catch-up). */
export interface OffsetEvent {
  cursor: string | null;
}

/** Stream connection state. */
export type StreamState = 'disconnected' | 'connecting' | 'catching-up' | 'live' | 'error';

/** Options for useLiveStream hook. */
export interface UseLiveStreamOptions {
  /** Organization ID to stream. */
  orgId: string;
  /** Entity types to filter (empty = all realtime entities). */
  entityTypes?: StreamMessage['entityType'][];
  /** Starting offset: 'now' for live-only, '-1' for full history, or activity ID. */
  initialOffset?: string | null;
  /** Callback when a stream message is received. */
  onMessage?: (message: StreamMessage) => void;
  /** Callback when catch-up is complete. */
  onCatchUpComplete?: (cursor: string | null) => void;
  /** Callback on connection state change. */
  onStateChange?: (state: StreamState) => void;
  /** Whether the stream is enabled. */
  enabled?: boolean;
}

/** Return value from useLiveStream hook. */
export interface UseLiveStreamReturn {
  /** Current connection state. */
  state: StreamState;
  /** Last known cursor (activity ID). */
  cursor: string | null;
  /** Manually reconnect. */
  reconnect: () => void;
  /** Manually disconnect. */
  disconnect: () => void;
}
