import type { SSEStreamingApi } from 'hono/streaming';
import type { ProductEntityType, PublicProductEntityType } from 'shared';
import type { ActivityEvent } from '#/lib/activity-bus';
import type { ContextEntityIdColumns } from '#/permissions/permission-manager/types';
import type { StreamNotification } from '#/schemas';

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

/**
 * Subscriber with cursor tracking.
 */
export interface CursoredSubscriber extends BaseStreamSubscriber {
  cursor: string | null;
}

/**
 * Configuration for creating a stream dispatcher.
 */
export interface DispatcherConfig<T extends CursoredSubscriber, E extends ActivityEvent = ActivityEvent> {
  /** Get channel from event (return null to skip dispatch) */
  getChannel: (event: E) => string | null;
  /** Filter function to check if subscriber should receive event */
  shouldReceive: (subscriber: T, event: E) => boolean;
  /** Optional: transform notification before sending (e.g., sign cache token per subscriber) */
  transformNotification?: (notification: StreamNotification, subscriber: T) => StreamNotification;
}

/** Event with subjectId and organizationId guaranteed present. */
export type EntityScopedEvent<E extends ActivityEvent = ActivityEvent> = E & {
  subjectId: string;
  organizationId: string;
};

/** Product entity event routed via the app (authenticated) stream. */
export type AppStreamProductEvent = EntityScopedEvent<
  ActivityEvent & { entityType: ProductEntityType } & Partial<ContextEntityIdColumns>
>;

/** Combined event type accepted by the app stream dispatcher. */
export type AppStreamEvent = AppStreamProductEvent | EntityScopedEvent<ActivityEvent & { resourceType: 'membership' }>;

/** Product entity event routed via the public stream. */
export type PublicStreamEvent = ActivityEvent & { entityType: PublicProductEntityType; subjectId: string };
