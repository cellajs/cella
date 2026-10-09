import { EventEmitter } from 'node:events';
import { SpanStatusCode } from '@opentelemetry/api';
import { isValidEventType, type ProductEntityType, type TrackedEventType } from 'shared';
import type { SyncTraceContext } from '#/lib/sync-metrics';
import { eventAttrs, recordMessageReceived, startSyncSpan, syncSpanNames } from '#/lib/sync-metrics';
import type { ActivityModel } from '#/modules/activities/activities-db';
import type { TrackedModel, TrackedType } from '#/tables';
import { log } from '#/utils/logger';

/**
 * One product row of an event: the fields that decide who may read it, its org-sequence position, and for a row whose
 * path changed the same fields of the row before the move.
 */
export interface ActivityRow {
  rowData: Record<string, unknown>;
  seq?: number;
  movedFrom?: Record<string, unknown> | null;
}

/** In-memory CDC event: the activity of a change with its row, or with its rows. `trace` stays internal for OTel correlation. */
export interface ActivityEvent extends Omit<ActivityModel, 'type' | 'createdAt'> {
  type: TrackedEventType;
  /** The whole row of a change that is no product: a membership, a tenant, a channel. Null on a product event. */
  rowData: unknown;
  /**
   * The rows of a product event, one or more, that one audience may read; the activity is that of the first. Each holds
   * its permission fields and no content: a listener that needs more reads the row. Null when the row is no product.
   */
  rows: ActivityRow[] | null;
  trace: SyncTraceContext | null;
}

/**
 * The row of an event of a tracked type that is no product, typed. A product event has no whole row: see `rows`.
 * @param event - The event.
 * @param trackedType - The entity or resource type the caller expects.
 * @returns The row, or undefined when the event is of another type.
 */
export function getEventData<T extends Exclude<TrackedType, ProductEntityType>>(event: ActivityEvent, trackedType: T): TrackedModel<T> | undefined {
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

  /** Called by the CDC WebSocket handler for each arriving message. */
  emit(event: ActivityEvent): void {
    if (!isValidEventType(event.type)) {
      log.warn('Unknown activity event type from CDC message', { type: event.type });
      return;
    }

    const span = startSyncSpan(syncSpanNames.activityBusReceive, eventAttrs(event), event.trace);

    recordMessageReceived(event.entityType || 'unknown');

    this.emitter.emit(event.type, event);
    log.trace('ActivityBus emitted event', { type: event.type, subjectId: event.subjectId });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }
}

export const activityBus = new ActivityBus();
