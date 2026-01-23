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
  /** Optional index key for fast lookup (e.g., 'org:abc', 'public:page') */
  indexKey?: string;
}
