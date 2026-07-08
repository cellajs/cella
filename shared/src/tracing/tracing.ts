export * from './span-names';
export { createSpanStoreProcessor, type SpanStoreProcessorOptions } from './span-store-processor';

// ================================
// Types
// ================================

/** Span status aligned with OTel conventions. */
export type SpanStatus = 'ok' | 'error' | 'unset';

/** Span data structure for storage and display; real OTel tracers create the underlying spans (see span-store-processor.ts for the bridge). */
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

/** Span event for recording notable moments. */
export interface SpanEvent {
  name: string;
  time: number;
  attributes?: Record<string, unknown>;
}

/** Trace context for propagation across services. */
export interface TraceContext {
  traceId: string;
  spanId: string;
  cdcTimestamp: number;
  lsn?: string;
}

/** Span store configuration. */
export interface SpanStoreOptions {
  maxSpans?: number;
  onSpanEnd?: (span: SpanData) => void;
}

/** Span statistics. */
export interface SpanStats {
  total: number;
  byPrefix: Record<string, number>;
  avgDurationMs: Record<string, number>;
  errorCount: number;
}

// ================================
// Span Store
// ================================

/** Callback for span updates. */
export type SpanSubscriber = (spans: SpanData[]) => void;

/**
 * Create an in-memory span store with subscription support.
 */
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

// ================================
// Span Statistics
// ================================

/** Compute statistics from a list of spans. */
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

// ================================
// Span Attribute Types
// ================================

/** Trace context passed in message payloads for e2e correlation. */
export interface IncomingTraceContext {
  traceId?: string;
  spanId?: string;
  cdcTimestamp?: number;
  lsn?: string;
}

/** Base span attributes (primitives only). */
export type SpanAttributeValue = string | number | boolean | null | undefined;

/** Span attributes with optional trace context for auto e2e latency. */
export interface SpanAttributes {
  [key: string]: SpanAttributeValue | IncomingTraceContext | undefined;
  _trace?: IncomingTraceContext;
}

// ================================
// Attribute Helpers
// ================================

/** Clean span attributes (no undefined values). */
export type CleanSpanAttributes = Record<string, string | number | boolean | null>;

/** Input for CDC WAL message attributes. */
export interface CdcInput {
  lsn: string;
  tag?: string;
  table?: string;
}

/** Build prefixed CDC attributes from a CDC message context. */
export function cdcAttrs(input: CdcInput): CleanSpanAttributes {
  return {
    lsn: input.lsn,
    'cdc.tag': input.tag ?? 'unknown',
    'cdc.table': input.table ?? 'unknown',
  };
}

/** Input for activity attributes (partial activity-like object). */
export interface ActivityInput {
  type?: string | null;
  action?: string | null;
  subjectId?: string | null;
  entityType?: string | null;
}

/** Build prefixed activity attributes from an activity object. */
export function activityAttrs(input: ActivityInput): CleanSpanAttributes {
  return {
    'activity.type': input.type ?? 'unknown',
    'activity.action': input.action ?? 'unknown',
    'activity.subjectId': input.subjectId ?? 'unknown',
    'activity.entityType': input.entityType ?? null,
  };
}

/** Input for event attributes (activity event in bus context). */
export interface EventInput {
  type: string;
  subjectId?: string | null;
  entityType?: string | null;
}

/** Build prefixed event attributes for ActivityBus spans. */
export function eventAttrs(input: EventInput): CleanSpanAttributes {
  return {
    'event.type': input.type,
    'event.subjectId': input.subjectId ?? null,
    'event.entityType': input.entityType ?? null,
  };
}
