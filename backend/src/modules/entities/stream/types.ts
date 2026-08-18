import type { SSEStreamingApi } from 'hono/streaming';
import type { ChannelIdColumns, ProductEntityType } from 'shared';
import type { ActivityEvent } from '#/lib/activity-bus';
import type { StreamNotification } from '#/schemas';

/** Modules extend this with their own fields. */
export interface BaseStreamSubscriber {
  id: string;
  stream: SSEStreamingApi;
  /** Primary channel for event routing, e.g. 'org:abc' or 'user:123'. */
  channel?: string;
  /** @internal Every channel this subscriber is registered on; set by the manager. */
  _channels?: string[];
}

export interface CursoredSubscriber extends BaseStreamSubscriber {
  cursor: string | null;
}

export interface DispatcherConfig<T extends CursoredSubscriber, E extends ActivityEvent = ActivityEvent> {
  /** Return null to skip dispatch. */
  getChannel: (event: E) => string | null;
  /** One batch call: the eligibility engine collapses subscribers into access classes per event. */
  selectEligible: (subscribers: T[], event: E) => T[];
  /** Transform the notification before sending, e.g. to sign a per-subscriber cache token. */
  transformNotification?: (notification: StreamNotification, subscriber: T) => StreamNotification;
}

/** Event with subjectId and organizationId already narrowed to strings. */
export type EntityScopedEvent<E extends ActivityEvent = ActivityEvent> = E & {
  subjectId: string;
  organizationId: string;
};

/** Product entity event routed via the app (authenticated) stream. */
export type AppStreamProductEvent = EntityScopedEvent<
  ActivityEvent & { entityType: ProductEntityType } & Partial<ChannelIdColumns>
>;

export type AppStreamMembershipEvent = EntityScopedEvent<ActivityEvent & { resourceType: 'membership' }>;

/** Combined event type accepted by the app stream dispatcher. */
export type AppStreamEvent = AppStreamProductEvent | AppStreamMembershipEvent;
