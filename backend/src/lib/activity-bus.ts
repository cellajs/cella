import { EventEmitter } from 'node:events';
import { z } from '@hono/zod-openapi';
import { SpanStatusCode } from '@opentelemetry/api';
import type { ProductEntityType, TrackedEventType } from 'shared';
import { permissionRowDataSchema } from 'shared/permissions/permission-row-data';
import type { TraceContext } from 'shared/tracing';
import { eventAttrs, recordMessageReceived, startSyncSpan, syncSpanNames } from '#/lib/sync-metrics';
import type { ActivityModel } from '#/modules/activities/activities-db';
import { activitySchema } from '#/modules/activities/activities-schema';
import type { TrackedModel, TrackedType } from '#/tables';
import { log } from '#/utils/logger';

/**
 * The activity columns that differ between the rows of one product event: a row carries its own, its subject as
 * `rowData.id`, and no commit time.
 */
export const ownActivityColumns = { id: true, userId: true, subjectId: true, changedFields: true, stx: true, createdAt: true } as const;

/** One of the `ownActivityColumns`. */
export type OwnActivityColumns = keyof typeof ownActivityColumns;

/**
 * One product row: the activity it was recorded as, its permission fields, its org-sequence position, and for a moved
 * row the permission fields it had before.
 */
export const messageRowSchema = z.object({
  activityId: activitySchema.shape.id,
  userId: activitySchema.shape.userId,
  changedFields: activitySchema.shape.changedFields,
  stx: activitySchema.shape.stx,
  rowData: permissionRowDataSchema,
  seq: z.number().optional(),
  movedFrom: permissionRowDataSchema.nullable().optional(),
});

/** One product row of an event. */
export type ActivityRow = z.infer<typeof messageRowSchema>;

/** What every event carries: its type, action and place. `trace` stays internal for OTel correlation. */
interface ActivityEventBase extends Omit<ActivityModel, 'type' | OwnActivityColumns> {
  type: TrackedEventType;
  trace: TraceContext | null;
}

/** In-memory CDC event of a row that is no product (a membership, a tenant, a channel): its activity and the whole row. */
export interface RowActivityEvent extends ActivityEventBase, Pick<ActivityModel, OwnActivityColumns> {
  rowData: unknown;
  rows: null;
  /** The versions of the signals this change moved, as the worker counted them; absent when it sent none. */
  signalVersions?: Record<string, number>;
}

/**
 * In-memory CDC event of product rows one audience may read, one or more, each with its own activity. A row holds its
 * permission fields and no content: a listener that needs more reads the row.
 */
export interface ProductActivityEvent extends ActivityEventBase {
  entityType: ProductEntityType;
  organizationId: string;
  tenantId: string;
  rowData: null;
  rows: ActivityRow[];
}

export type ActivityEvent = RowActivityEvent | ProductActivityEvent;

/** The event a listener of `T` receives: the event of a product type carries rows. */
export type ActivityEventOf<T extends TrackedEventType> = T extends `${ProductEntityType}.${string}` ? ProductActivityEvent : RowActivityEvent;

/**
 * The row of an event of a tracked type that is no product, typed. A product event has no whole row: see `rows`.
 * @param trackedType - The entity or resource type the caller expects.
 * @returns The row, or undefined when the event is of another type.
 */
export function getEventData<T extends Exclude<TrackedType, ProductEntityType>>(
  event: RowActivityEvent,
  trackedType: T,
): TrackedModel<T> | undefined {
  const matches = event.entityType === trackedType || event.resourceType === trackedType;
  return matches ? (event.rowData as TrackedModel<T>) : undefined;
}

type EventHandler<T extends TrackedEventType> = (event: ActivityEventOf<T>) => void | Promise<void>;

/** Distributes the CDC events the socket receives to in-process handlers and stream subscribers. */
class ActivityBus {
  private emitter = new EventEmitter().setMaxListeners(100);

  on<T extends TrackedEventType>(eventType: T, handler: EventHandler<T>): this {
    this.emitter.on(eventType, handler);
    return this;
  }

  once<T extends TrackedEventType>(eventType: T, handler: EventHandler<T>): this {
    this.emitter.once(eventType, handler);
    return this;
  }

  off<T extends TrackedEventType>(eventType: T, handler: EventHandler<T>): this {
    this.emitter.off(eventType, handler);
    return this;
  }

  emit(event: ActivityEvent): void {
    const span = startSyncSpan(syncSpanNames.activityBusReceive, eventAttrs(event), event.trace);

    recordMessageReceived(event.entityType || 'unknown');

    this.emitter.emit(event.type, event);
    log.trace('ActivityBus emitted event', { type: event.type });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }
}

/** The process's one activity bus. */
export const activityBus = new ActivityBus();
