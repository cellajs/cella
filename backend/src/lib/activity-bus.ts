import { EventEmitter } from 'node:events';
import { SpanStatusCode } from '@opentelemetry/api';
import { isValidEventType, type PropagationHint, type TrackedEventType, trackedEventTypes } from 'shared';
import type { SyncTraceContext } from '#/lib/sync-metrics';
import { eventAttrs, recordMessageReceived, startSyncSpan, syncSpanNames } from '#/lib/sync-metrics';
import type { ActivityModel } from '#/modules/activities/activities-db';
import type { TrackedModel, TrackedType } from '#/tables';
import { log } from '#/utils/logger';

/** Valid event types, iterated by the onAny/offAny wildcard subscriptions. */
const allEventTypes = new Set<TrackedEventType>(trackedEventTypes);

/** Per-row batch payload (permission-relevant fields only), mirrored from the CDC wire. */
export interface ActivityBatchRow {
  seq?: number;
  rowData: Record<string, unknown>;
  /** Old-row permission subset when this row's path changed (move-out), else absent. */
  movedFrom?: Record<string, unknown> | null;
}

/** In-memory CDC event. Sync fields flow to client stream notifications; `trace` stays internal for OTel correlation. */
export interface ActivityEvent extends Omit<ActivityModel, 'type' | 'createdAt'> {
  type: TrackedEventType;
  rowData: unknown;
  /** Old-row permission subset when the row's path changed (move-out), else null. */
  movedFrom?: Record<string, unknown> | null;
  /** Per-row permission fields let dispatch decide visibility per subscriber and row. */
  batchRows?: ActivityBatchRow[] | null;
  // Sync fields from CDC worker (org-sequence position values)
  seq: number | null;
  batchUntilSeq: number | null;
  /** Authoritative row count for batches: the sequence range may interleave with other groups. */
  count: number | null;
  propagation: PropagationHint | null;
  trace: SyncTraceContext | null;
}

/** Returns the row data typed when the event's entity or resource type matches. */
export function getEventData<T extends TrackedType>(event: ActivityEvent, trackedType: T): TrackedModel<T> | undefined {
  const matches = event.entityType === trackedType || event.resourceType === trackedType;
  return matches ? (event.rowData as TrackedModel<T>) : undefined;
}

type EventHandler = (event: ActivityEvent) => void | Promise<void>;

/** Receives CDC messages over the WebSocket and distributes them to internal handlers and stream subscribers. */
class ActivityBus {
  private emitter = new EventEmitter();

  constructor() {
    // Increase max listeners to avoid warnings with many subscribers
    this.emitter.setMaxListeners(100);
  }

  on(eventType: TrackedEventType, handler: EventHandler): this {
    this.emitter.on(eventType, handler);
    return this;
  }

  once(eventType: TrackedEventType, handler: EventHandler): this {
    this.emitter.once(eventType, handler);
    return this;
  }

  off(eventType: TrackedEventType, handler: EventHandler): this {
    this.emitter.off(eventType, handler);
    return this;
  }

  /** Subscribe to every event type, used by stream handlers that fan out to subscribers. */
  onAny(handler: EventHandler): this {
    for (const eventType of allEventTypes) {
      this.emitter.on(eventType, handler);
    }
    return this;
  }

  offAny(handler: EventHandler): this {
    for (const eventType of allEventTypes) {
      this.emitter.off(eventType, handler);
    }
    return this;
  }

  /** Called by the CDC WebSocket handler for each arriving message. */
  emit(event: ActivityEvent): void {
    if (!isValidEventType(event.type)) {
      log.warn('Unknown activity event type from CDC message', { type: event.type });
      return;
    }

    const span = startSyncSpan(syncSpanNames.activityBusReceive, eventAttrs(event), event.trace?.traceId);

    recordMessageReceived(event.entityType || 'unknown');

    this.emitter.emit(event.type, event);
    log.trace('ActivityBus emitted event', { type: event.type, subjectId: event.subjectId });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }
}

export const activityBus = new ActivityBus();
