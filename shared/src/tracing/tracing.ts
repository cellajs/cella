import type { EntityType } from '../../types.ts';

export * from './span-names.ts';
export { createSpanStoreProcessor, type SpanStoreProcessorOptions } from './span-store-processor.ts';

/** Aligned with OTel conventions. */
export type SpanStatus = 'ok' | 'error' | 'unset';

/** Stored and displayed shape; real OTel tracers create the spans. @see span-store-processor.ts */
export interface SpanData {
  traceId: string;
  spanId: string;
  name: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  attributes: Record<string, string | number | boolean | null>;
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
  cdcTimestamp: number;
  lsn?: string;
}

export interface SpanStoreOptions {
  maxSpans?: number;
  onSpanEnd?: (span: SpanData) => void;
}

export interface SpanStats {
  total: number;
  byPrefix: Record<string, number>;
  avgDurationMs: Record<string, number>;
  errorCount: number;
}

// Span store

export type SpanSubscriber = (spans: SpanData[]) => void;

/** In-memory, with subscription support. */
export function createSpanStore(options: SpanStoreOptions = {}) {
  const { maxSpans = 500, onSpanEnd } = options;

  const spans: SpanData[] = [];
  const subscribers = new Set<SpanSubscriber>();

  function addSpan(span: SpanData): void {
    spans.push(span);
    if (spans.length > maxSpans) {
      spans.splice(0, spans.length - maxSpans);
    }
    onSpanEnd?.(span);
    const snapshot = [...spans];
    for (const subscriber of subscribers) {
      subscriber(snapshot);
    }
  }

  function getSpans(): SpanData[] {
    return [...spans];
  }

  function getSpansByPrefix(prefix: string): SpanData[] {
    return spans.filter((s) => s.name.startsWith(prefix));
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

  function getStats(): SpanStats {
    return computeSpanStats(spans);
  }

  return {
    addSpan,
    getSpans,
    getSpansByPrefix,
    subscribe,
    clear,
    getStats,
    get length() {
      return spans.length;
    },
  };
}

export type SpanStore = ReturnType<typeof createSpanStore>;

export function computeSpanStats(spans: SpanData[]): SpanStats {
  const byPrefix: Record<string, number> = {};
  const durationSums: Record<string, number> = {};
  const durationCounts: Record<string, number> = {};
  let errorCount = 0;

  for (const span of spans) {
    const prefix = span.name.split('.').slice(0, 2).join('.');
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;

    if (span.duration != null) {
      durationSums[prefix] = (durationSums[prefix] || 0) + span.duration;
      durationCounts[prefix] = (durationCounts[prefix] || 0) + 1;
    }

    if (span.status === 'error') errorCount++;
  }

  const avgDurationMs: Record<string, number> = {};
  for (const [prefix, sum] of Object.entries(durationSums)) {
    avgDurationMs[prefix] = Math.round(sum / (durationCounts[prefix] ?? 1));
  }

  return { total: spans.length, byPrefix, avgDurationMs, errorCount };
}

// Span attribute types

/** Carried in message payloads for end-to-end correlation. */
export interface IncomingTraceContext {
  traceId?: string;
  spanId?: string;
  cdcTimestamp?: number;
  lsn?: string;
}

/** Primitives only. */
export type SpanAttributeValue = string | number | boolean | null | undefined;

/** The optional trace context yields end-to-end latency. */
export interface SpanAttributes {
  [key: string]: SpanAttributeValue | IncomingTraceContext;
  _trace?: IncomingTraceContext;
}

// Attribute helpers

/** No undefined values. */
export type CleanSpanAttributes = Record<string, string | number | boolean | null>;

export interface CdcInput {
  lsn: string;
  tag?: string;
  table?: string;
}

export function cdcAttrs(input: CdcInput): CleanSpanAttributes {
  return {
    lsn: input.lsn,
    'cdc.tag': input.tag ?? 'unknown',
    'cdc.table': input.table ?? 'unknown',
  };
}

export interface ActivityInput {
  type?: string | null;
  action?: string | null;
  subjectId?: string | null;
  entityType?: EntityType | null;
}

export function activityAttrs(input: ActivityInput): CleanSpanAttributes {
  return {
    'activity.type': input.type ?? 'unknown',
    'activity.action': input.action ?? 'unknown',
    'activity.subjectId': input.subjectId ?? 'unknown',
    'activity.entityType': input.entityType ?? null,
  };
}

export interface EventInput {
  type: string;
  subjectId?: string | null;
  entityType?: EntityType | null;
}

export function eventAttrs(input: EventInput): CleanSpanAttributes {
  return {
    'event.type': input.type,
    'event.subjectId': input.subjectId ?? null,
    'event.entityType': input.entityType ?? null,
  };
}
