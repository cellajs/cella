import type { SSEStreamingApi } from 'hono/streaming';

/**
 * Base subscriber interface.
 * Modules extend this with their own fields.
 */
export interface BaseStreamSubscriber {
  /** Unique ID for this subscriber */
  id: string;
  /** SSE stream for sending messages */
  stream: SSEStreamingApi;
  /** Primary channel for event routing (e.g., 'org:abc', 'user:123') */
  channel?: string;
  /** Internal: all channels this subscriber is registered on (set by manager) */
  _channels?: string[];
}
