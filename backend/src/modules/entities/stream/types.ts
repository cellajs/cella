import type { SSEStreamingApi } from 'hono/streaming';
import type { ChannelIdColumns, ProductEntityType } from 'shared';
import type { ActivityEvent, ActivityRow } from '#/lib/activity-bus';

/** Modules extend this with their own fields. */
export interface BaseStreamSubscriber {
  id: string;
  stream: SSEStreamingApi;
  /** The topic the subscriber is routed by, such as `user:123`; `register` takes more. */
  topic?: string;
}

/** Event with subjectId and organizationId already narrowed to strings. */
type EntityScopedEvent<E extends ActivityEvent = ActivityEvent> = E & { subjectId: string; organizationId: string };

/** Product entity event routed via the app (authenticated) stream as a change: it always has rows. */
export type AppStreamProductEvent = EntityScopedEvent<
  ActivityEvent & { entityType: ProductEntityType; rows: ActivityRow[] } & Partial<ChannelIdColumns>
>;
