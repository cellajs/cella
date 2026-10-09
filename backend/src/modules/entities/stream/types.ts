import type { SSEStreamingApi } from 'hono/streaming';
import type { ChannelIdColumns, ProductEntityType } from 'shared';
import type { ActivityEvent, ActivityRow } from '#/lib/activity-bus';

/** Modules extend this with their own fields. */
export interface BaseStreamSubscriber {
  id: string;
  stream: SSEStreamingApi;
  /** Primary channel for event routing, e.g. 'org:abc' or 'user:123'. */
  channel?: string;
  /** @internal Every channel this subscriber is registered on; set by the manager. */
  _channels?: string[];
}

export interface DispatcherConfig<T extends BaseStreamSubscriber, E extends ActivityEvent = ActivityEvent> {
  /** Return null to skip dispatch. */
  getChannel: (event: E) => string | null;
  /** One batch call: the eligibility engine collapses subscribers into access classes per event. */
  selectEligible: (subscribers: T[], event: E) => T[];
}

/** Event with subjectId and organizationId already narrowed to strings. */
export type EntityScopedEvent<E extends ActivityEvent = ActivityEvent> = E & { subjectId: string; organizationId: string };

/** Product entity event routed via the app (authenticated) stream: it always has rows. */
export type AppStreamProductEvent = EntityScopedEvent<
  ActivityEvent & { entityType: ProductEntityType; rows: ActivityRow[] } & Partial<ChannelIdColumns>
>;

export type AppStreamMembershipEvent = EntityScopedEvent<ActivityEvent & { resourceType: 'membership' }>;

/** Combined event type accepted by the app stream dispatcher. */
export type AppStreamEvent = AppStreamProductEvent | AppStreamMembershipEvent;
