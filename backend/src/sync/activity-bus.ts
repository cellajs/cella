import { EventEmitter } from 'node:events';
import { appConfig, type EntityType, type ResourceType } from 'shared';
import type { ActivityModel } from '#/db/schema/activities';
import { type TrackedModel, type TrackedType } from '#/table-config';
import { logEvent } from '#/utils/logger';
import { eventAttrs, recordMessageReceived, type SyncTraceContext, startSyncSpan, syncSpanNames } from './sync-metrics';

// Re-export from activity-actions for backward compatibility
export { type ActivityAction, activityActions } from './activity-actions';

import { type ActivityAction, activityActions } from './activity-actions';

/**
 * All possible tracked types (entities + resources) for event type generation.
 */
const trackedTypes = [...appConfig.entityTypes, ...appConfig.resourceTypes] as const;

/**
 * Generate all possible activity event types.
 * Format: `{entityOrResourceType}.{verb}` (e.g., 'membership.created', 'user.updated')
 */
const actionVerbs = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
} as const satisfies Record<ActivityAction, string>;

type ActionVerb = (typeof actionVerbs)[ActivityAction];

/**
 * Strongly typed activity event type.
 * Examples: 'user.created', 'membership.updated', 'organization.deleted'
 */
export type ActivityEventType = `${TrackedType}.${ActionVerb}`;

/**
 * Generate all valid event types at runtime for validation.
 */
const validEventTypes = new Set<ActivityEventType>(
  trackedTypes.flatMap((type) =>
    activityActions.map((action) => `${type}.${actionVerbs[action]}` as ActivityEventType),
  ),
);

/**
 * Type predicate to check if a string is a valid ActivityEventType.
 */
export function isValidEventType(type: string): type is ActivityEventType {
  return validEventTypes.has(type as ActivityEventType);
}

/**
 * Activity event payload derived from ActivityModel with tighter typing.
 * The `type` and `action` fields are narrowed to known values.
 */
export type ActivityEvent = Omit<ActivityModel, 'type' | 'action' | 'entityType' | 'resourceType' | 'createdAt'> & {
  type: ActivityEventType;
  action: ActivityAction;
  entityType: EntityType | null;
  resourceType: ResourceType | null;
  createdAt: string; // ISO string from JSON serialization
};

/**
 * Activity event with entity data, created from CDC message.
 * This is the in-memory event format emitted by ActivityBus.
 */
export interface ActivityEventWithEntity extends ActivityEvent {
  /** Full entity data from CDC Worker replication row. */
  entity?: unknown;
  /** Cache token for server-side entity cache (realtime entities only). */
  cacheToken?: string | null;
  /** Trace context for end-to-end correlation. */
  _trace?: SyncTraceContext;
}

/**
 * Type guard helper to get typed entity from an event.
 * Returns the entity with proper typing if the event matches the specified type.
 *
 * @example
 * ```typescript
 * if (event.resourceType === 'membership') {
 *   const membership = getTypedEntity(event, 'membership');
 *   console.info(membership?.userId); // Properly typed as string
 * }
 * ```
 */
export function getTypedEntity<T extends TrackedType>(
  event: ActivityEventWithEntity,
  trackedType: T,
): TrackedModel<T> | undefined {
  const matches = event.entityType === trackedType || event.resourceType === trackedType;
  return matches ? (event.entity as TrackedModel<T>) : undefined;
}

/**
 * Event handler function type.
 */
type EventHandler = (event: ActivityEventWithEntity) => void | Promise<void>;

/**
 * ActivityBus receives CDC messages via WebSocket, transforms them into
 * in-memory events, and distributes to internal handlers and stream subscribers.
 *
 * Terminology:
 * - CDC sends "messages" (JSON payloads via WebSocket)
 * - ActivityBus emits "events" (in-memory, via EventEmitter)
 * - SSE sends "notifications" (to clients)
 *
 * Requires CDC Worker to be running (DEV_MODE=full or production).
 * In basic/core mode, realtime features are not available.
 *
 * @example
 * ```typescript
 * import { activityBus } from '#/sync/activity-bus';
 *
 * // Subscribe to membership creation events
 * activityBus.on('membership.created', async (event) => {
 *   console.info('New membership:', event.entityId);
 *   if (event.entity) {
 *     console.info('Entity data:', event.entity);
 *   }
 * });
 * ```
 */
class ActivityBus {
  private emitter = new EventEmitter();

  constructor() {
    // Increase max listeners to avoid warnings with many subscribers
    this.emitter.setMaxListeners(100);
  }

  /**
   * Subscribe to a specific activity event type.
   * @param eventType - The event type to listen for (e.g., 'membership.created')
   * @param handler - The handler function to call when the event occurs
   */
  on(eventType: ActivityEventType, handler: EventHandler): this {
    this.emitter.on(eventType, handler);
    return this;
  }

  /**
   * Subscribe to a specific activity event type (one-time).
   * @param eventType - The event type to listen for
   * @param handler - The handler function to call once
   */
  once(eventType: ActivityEventType, handler: EventHandler): this {
    this.emitter.once(eventType, handler);
    return this;
  }

  /**
   * Unsubscribe from a specific activity event type.
   * @param eventType - The event type to stop listening for
   * @param handler - The specific handler to remove
   */
  off(eventType: ActivityEventType, handler: EventHandler): this {
    this.emitter.off(eventType, handler);
    return this;
  }

  /**
   * Subscribe to all activity events (wildcard).
   * Useful for stream handlers that need to fan out to subscribers.
   * @param handler - The handler function to call for any event
   */
  onAny(handler: EventHandler): this {
    // Subscribe to all valid event types
    for (const eventType of validEventTypes) {
      this.emitter.on(eventType, handler);
    }
    return this;
  }

  /**
   * Unsubscribe from all activity events.
   * @param handler - The handler function to remove from all event types
   */
  offAny(handler: EventHandler): this {
    for (const eventType of validEventTypes) {
      this.emitter.off(eventType, handler);
    }
    return this;
  }

  /**
   * Emit an activity event transformed from a CDC message.
   * Called by the CDC WebSocket handler when messages arrive.
   * @param event - The activity event with entity data
   */
  emit(event: ActivityEventWithEntity): void {
    if (!isValidEventType(event.type)) {
      logEvent('warn', 'Unknown activity event type from CDC message', { type: event.type });
      return;
    }

    // Start span for tracing
    const span = startSyncSpan(syncSpanNames.activityBusReceive, eventAttrs(event), event._trace?.traceId);

    // Record CDC message received metric
    recordMessageReceived(event.entityType || 'unknown');

    this.emitter.emit(event.type, event);
    logEvent('debug', 'ActivityBus emitted event', { type: event.type, entityId: event.entityId });

    span.setStatus('ok');
    span.end();
  }
}

/** Singleton ActivityBus instance */
export const activityBus = new ActivityBus();
