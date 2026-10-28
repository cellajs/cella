import { type Context, ROOT_CONTEXT, TraceFlags, trace } from '@opentelemetry/api';
import type { EntityType } from '../../types.ts';

/** Aligned with OTel conventions. */
export type SpanStatus = 'ok' | 'error' | 'unset';

/** No undefined values. */
export type CleanSpanAttributes = Record<string, string | number | boolean | null>;

/**
 * Stored and displayed shape; real OTel tracers create the spans. Times are epoch milliseconds, here and in `events`.
 * @see span-store-processor.ts
 */
export interface SpanData {
  traceId: string;
  spanId: string;
  name: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  attributes: CleanSpanAttributes;
  status: SpanStatus;
  events: SpanEvent[];
  parentSpanId?: string;
}

export interface SpanEvent {
  name: string;
  time: number;
  attributes?: Record<string, unknown>;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  /** W3C trace flags of the span, so a process that continues the trace keeps its sampling decision. */
  traceFlags?: number;
  /** When the context was built, in epoch milliseconds. */
  cdcTimestamp: number;
  lsn?: string;
}

/**
 * The context of a span that ran in another process, for starting a span as its child: both then belong to one trace.
 * A context that carries no flags counts as sampled.
 */
export function remoteParentContext(parent: Pick<TraceContext, 'traceId' | 'spanId' | 'traceFlags'>): Context {
  const { traceId, spanId, traceFlags = TraceFlags.SAMPLED } = parent;
  return trace.setSpanContext(ROOT_CONTEXT, { traceId, spanId, traceFlags, isRemote: true });
}

export interface SpanStoreOptions {
  maxSpans?: number;
}

export interface SpanStats {
  total: number;
  byPrefix: Record<string, number>;
  avgDurationMs: Record<string, number>;
  errorCount: number;
}

export type SpanSubscriber = (spans: SpanData[]) => void;

/** In-memory, with subscription support. */
export function createSpanStore(options: SpanStoreOptions = {}) {
  const { maxSpans = 500 } = options;

  const spans: SpanData[] = [];
  const subscribers = new Set<SpanSubscriber>();

  function addSpan(span: SpanData): void {
    spans.push(span);
    if (spans.length > maxSpans) {
      spans.splice(0, spans.length - maxSpans);
    }
    const snapshot = [...spans];
    for (const subscriber of subscribers) {
      subscriber(snapshot);
    }
  }

  function getSpans(): SpanData[] {
    return [...spans];
  }

  function subscribe(callback: SpanSubscriber): () => void {
    subscribers.add(callback);
    callback([...spans]);
    return () => subscribers.delete(callback);
  }

  function clear(): void {
    spans.length = 0;
    for (const subscriber of subscribers) {
      subscriber([]);
    }
  }

  return { addSpan, getSpans, subscribe, clear };
}

export type SpanStore = ReturnType<typeof createSpanStore>;

/** Counts and mean durations per name prefix (the first two dot segments, `cdc.wal`), and the error count. */
export function computeSpanStats(spans: SpanData[]): SpanStats {
  const byPrefix: Record<string, number> = {};
  const durations: Record<string, { sum: number; count: number }> = {};
  let errorCount = 0;

  for (const span of spans) {
    const prefix = span.name.split('.').slice(0, 2).join('.');
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;

    if (span.duration != null) {
      const total = durations[prefix] ?? { sum: 0, count: 0 };
      total.sum += span.duration;
      total.count++;
      durations[prefix] = total;
    }

    if (span.status === 'error') errorCount++;
  }

  const avgDurationMs: Record<string, number> = {};
  for (const [prefix, { sum, count }] of Object.entries(durations)) {
    avgDurationMs[prefix] = Math.round(sum / count);
  }

  return { total: spans.length, byPrefix, avgDurationMs, errorCount };
}

export interface CdcInput {
  lsn: string;
  tag?: string;
  table?: string;
}

/** The attributes of a CDC span; an absent tag or table reads `'unknown'`. */
export function cdcAttrs(input: CdcInput): CleanSpanAttributes {
  return { 'cdc.lsn': input.lsn, 'cdc.tag': input.tag ?? 'unknown', 'cdc.table': input.table ?? 'unknown' };
}

export interface ActivityInput {
  type?: string | null;
  action?: string | null;
  subjectId?: string | null;
  entityType?: EntityType | null;
}

/** The attributes of an activity span; an absent field reads `'unknown'`, an absent entity type `null`. */
export function activityAttrs(input: ActivityInput): CleanSpanAttributes {
  return {
    'activity.type': input.type ?? 'unknown',
    'activity.action': input.action ?? 'unknown',
    'activity.subject_id': input.subjectId ?? 'unknown',
    'activity.entity_type': input.entityType ?? null,
  };
}

export interface EventInput {
  type: string;
  subjectId?: string | null;
  entityType?: EntityType | null;
}

/** The attributes of an event span; an absent subject or entity type reads `null`. */
export function eventAttrs(input: EventInput): CleanSpanAttributes {
  return { 'event.type': input.type, 'event.subject_id': input.subjectId ?? null, 'event.entity_type': input.entityType ?? null };
}
