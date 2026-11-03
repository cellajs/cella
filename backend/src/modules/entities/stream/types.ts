import type { SSEStreamingApi } from 'hono/streaming';
import type { ChannelIdColumns } from 'shared';
import type { ProductActivityEvent } from '#/lib/activity-bus';

/** Modules extend this with their own fields. */
export interface BaseStreamSubscriber {
  id: string;
  stream: SSEStreamingApi;
  /** The topic the subscriber is routed by, such as `user:123`; `register` takes more. */
  topic?: string;
}

/** A product event routed via the app (authenticated) stream as changes, its organization present. */
export type AppStreamProductEvent = ProductActivityEvent & { organizationId: string } & Partial<ChannelIdColumns>;
