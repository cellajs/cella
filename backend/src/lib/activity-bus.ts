import { EventEmitter } from 'node:events';
import { SpanStatusCode } from '@opentelemetry/api';
import { type ActivityEventType, activityEventTypes, isValidEventType, type PropagationHint } from 'shared';
import type { ActivityModel } from '#/db/schema/activities';
import {
  eventAttrs,
  recordMessageReceived,
  type SyncTraceContext,
  startSyncSpan,
  syncSpanNames,
} from '#/lib/sync-metrics';
import type { TrackedModel, TrackedType } from '#/tables';
import { logEvent } from '#/utils/logger';

/**
 * Set of valid event types for onAny/offAny wildcard iteration.
 */
const allEventTypes = new Set<ActivityEventType>(activityEventTypes);

/**
 * Activity event with entity or resource data, created from CDC message.
 * This is the in-memory event format emitted by ActivityBus.
 *
 * Sync fields (seq, cacheToken, etc.) originate from the CDC worker and are
 * passed through to StreamNotification for the client sync engine.
 * `trace` is backend-internal only (OTel span correlation).
 */
export interface ActivityEvent extends Omit<ActivityModel, 'type' | 'createdAt'> {
  type: ActivityEventType;
  rowData: unknown;
  // Sync fields from CDC worker
  cacheToken: string | null;
  seq: number | null;
  batchUntilSeq: number | null;
  deletedIds: string[] | null;
  propagation: PropagationHint | null;
  trace: SyncTraceContext | null;
}

/**
 * Get typed data from an activity event if it matches the specified tracked type (entity or resource).
 */
export function getEventData<T extends TrackedType>(event: ActivityEvent, trackedType: T): TrackedModel<T> | undefined {
  const matches = event.entityType === trackedType || event.resourceType === trackedType;
  return matches ? (event.rowData as TrackedModel<T>) : undefined;
}

/**
 * Event handler function type.
 */
type EventHandler = (event: ActivityEvent) => void | Promise<void>;

/**
 * ActivityBus receives CDC messages via WebSocket, transforms them into
 * in-memory events, and distributes to internal handlers and stream subscribers.
 *
 */
class ActivityBus {
  private emitter = new EventEmitter();

  constructor() {
    // Increase max listeners to avoid warnings with many subscribers
    this.emitter.setMaxListeners(100);
  }

  /** Subscribe to a specific activity event type. */
  on(eventType: ActivityEventType, handler: EventHandler): this {
    this.emitter.on(eventType, handler);
    return this;
  }

  /** Subscribe to a specific activity event type (one-time). */
  once(eventType: ActivityEventType, handler: EventHandler): this {
    this.emitter.once(eventType, handler);
    return this;
  }

  /** Unsubscribe from a specific activity event type. */
  off(eventType: ActivityEventType, handler: EventHandler): this {
    this.emitter.off(eventType, handler);
    return this;
  }

  /**
   * Subscribe to all activity events (wildcard).
   * Useful for stream handlers that need to fan out to subscribers.
   */
  onAny(handler: EventHandler): this {
    // Subscribe to all valid event types
    for (const eventType of allEventTypes) {
      this.emitter.on(eventType, handler);
    }
    return this;
  }

  /**
   * Unsubscribe from all activity events.
   */
  offAny(handler: EventHandler): this {
    for (const eventType of allEventTypes) {
      this.emitter.off(eventType, handler);
    }
    return this;
  }

  /**
   * Emit an activity event transformed from a CDC message.
   * Called by the CDC WebSocket handler when messages arrive.
   */
  emit(event: ActivityEvent): void {
    if (!isValidEventType(event.type)) {
      logEvent(null, 'warn', 'Unknown activity event type from CDC message', { type: event.type });
      return;
    }

    // Start span for tracing
    const span = startSyncSpan(syncSpanNames.activityBusReceive, eventAttrs(event), event.trace?.traceId);

    // Record CDC message received metric
    recordMessageReceived(event.entityType || 'unknown');

    this.emitter.emit(event.type, event);
    logEvent(null, 'trace', 'ActivityBus emitted event', { type: event.type, subjectId: event.subjectId });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }
}

/** Singleton ActivityBus instance */
export const activityBus = new ActivityBus();
