import { EventEmitter } from 'node:events';
import { appConfig, type EntityType } from 'config';
import type { ActivityModel } from '#/db/schema/activities';
import { type ResourceType, resourceTypes, type TrackedModel, type TrackedType } from '#/table-config';
import { logEvent } from '#/utils/logger';
import { eventAttrs, recordEventReceived, type SyncTraceContext, startSyncSpan, syncSpanNames } from './sync-metrics';

/**
 * Activity actions aligned with HTTP methods (excluding 'read').
 */
export const activityActions = ['create', 'update', 'delete'] as const;

export type ActivityAction = (typeof activityActions)[number];

/**
 * All possible tracked types (entities + resources) for event type generation.
 */
const trackedTypes = [...appConfig.entityTypes, ...resourceTypes] as const;

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
 * Activity event with entity data from CDC Worker.
 */
export interface ActivityEventWithEntity extends ActivityEvent {
  /** Full entity data from CDC Worker replication row. */
  entity?: unknown;
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
 *   console.log(membership?.userId); // Properly typed as string
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
 * ActivityBus receives activity events from CDC Worker via WebSocket
 * and distributes them to internal handlers and live stream subscribers.
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
   * Emit an activity event received from CDC Worker via WebSocket.
   * Called by the CDC WebSocket handler when events arrive.
   * @param event - The activity event with entity data
   */
  emit(event: ActivityEventWithEntity): void {
    if (!isValidEventType(event.type)) {
      logEvent('warn', 'Unknown activity event type from CDC', { type: event.type });
      return;
    }

    // Start span for tracing
    const span = startSyncSpan(syncSpanNames.activityBusReceive, eventAttrs(event), event._trace?.traceId);

    // Record metric
    recordEventReceived(event.entityType || 'unknown');

    this.emitter.emit(event.type, event);
    logEvent('debug', 'ActivityBus emitted event', { type: event.type, entityId: event.entityId });

    span.setStatus('ok');
    span.end();
  }
}

/** Singleton ActivityBus instance */
export const activityBus = new ActivityBus();
