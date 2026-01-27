/**
 * @cella/tracing - Shared lightweight tracing utilities
 *
 * Provides a minimal, OTel-compatible span implementation for unified
 * tracing across frontend, backend, and CDC Worker without heavy SDK dependencies.
 */

import { customAlphabet } from 'nanoid';

// Re-export span names
export * from './span-names';

/** Custom nanoid using lowercase alphanumeric (matches cella convention). */
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789');

// ================================
// Types
// ================================

/** Span status aligned with OTel conventions. */
export type SpanStatus = 'ok' | 'error' | 'unset';

/** Span data structure for storage and display. */
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

/** Options for starting a span. */
export interface SpanOptions {
  attributes?: Record<string, string | number | boolean | null>;
  parentSpanId?: string;
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
// ID Generation
// ================================

/** Generate a trace ID. */
export function generateTraceId(): string {
  return nanoid(32);
}

/** Generate a span ID. */
export function generateSpanId(): string {
  return nanoid(16);
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
  for (const prefix of Object.keys(durationSums)) {
    avgDurationMs[prefix] = Math.round(durationSums[prefix] / durationCounts[prefix]);
  }

  return { total: spans.length, byPrefix, avgDurationMs, errorCount };
}

// ================================
// Lightweight Span
// ================================

/** Lightweight span implementation with OTel-compatible API. */
export class LightweightSpan {
  private data: SpanData;
  private ended = false;
  private store?: SpanStore;

  constructor(name: string, options?: SpanOptions, store?: SpanStore) {
    this.store = store;
    this.data = {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      name,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      attributes: {},
      status: 'unset',
      events: [],
      parentSpanId: options?.parentSpanId,
    };

    if (options?.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        if (value !== undefined) {
          this.data.attributes[key] = value;
        }
      }
    }
  }

  setAttribute(key: string, value: string | number | boolean | null): this {
    this.data.attributes[key] = value;
    return this;
  }

  setAttributes(attributes: Record<string, string | number | boolean | null>): this {
    Object.assign(this.data.attributes, attributes);
    return this;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): this {
    this.data.events.push({ name, time: Date.now(), attributes });
    return this;
  }

  /** Set span status. Accepts OTel-style object or simple string. */
  setStatus(status: { code: number; message?: string } | SpanStatus): this {
    if (typeof status === 'string') {
      this.data.status = status;
    } else {
      this.data.status = status.code === 2 ? 'error' : status.code === 1 ? 'ok' : 'unset';
    }
    return this;
  }

  recordException(exception: Error): this {
    this.addEvent('exception', {
      'exception.type': exception.name,
      'exception.message': exception.message,
      'exception.stacktrace': exception.stack,
    });
    this.data.status = 'error';
    this.data.attributes['error.message'] = exception.message;
    this.data.attributes['error.name'] = exception.name;
    return this;
  }

  recordError(exception: Error): this {
    return this.recordException(exception);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.data.endTime = Date.now();
    this.data.duration = this.data.endTime - this.data.startTime;
    this.store?.addSpan(this.data);
  }

  getTraceContext(): TraceContext {
    return {
      traceId: this.data.traceId,
      spanId: this.data.spanId,
      cdcTimestamp: this.data.startTime,
      lsn: this.data.attributes.lsn as string | undefined,
    };
  }

  spanContext() {
    return { traceId: this.data.traceId, spanId: this.data.spanId };
  }

  isRecording(): boolean {
    return !this.ended;
  }

  getData(): Readonly<SpanData> {
    return this.data;
  }

  get spanId(): string {
    return this.data.spanId;
  }

  get traceId(): string {
    return this.data.traceId;
  }
}

// ================================
// Tracer Factory
// ================================

/** Create a tracer with optional span store. */
export function createTracer(store?: SpanStore) {
  return {
    startSpan(name: string, options?: SpanOptions): LightweightSpan {
      return new LightweightSpan(name, options, store);
    },

    startActiveSpan<T>(name: string, fn: (span: LightweightSpan) => T, options?: SpanOptions): T {
      const span = this.startSpan(name, options);
      try {
        const result = fn(span);
        if (result instanceof Promise) {
          return result
            .then((value) => {
              span.setStatus({ code: 1 });
              span.end();
              return value;
            })
            .catch((error) => {
              span.recordException(error instanceof Error ? error : new Error(String(error)));
              span.end();
              throw error;
            }) as T;
        }
        span.setStatus({ code: 1 });
        span.end();
        return result;
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.end();
        throw error;
      }
    },
  };
}

export type Tracer = ReturnType<typeof createTracer>;

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
// withSpan Helpers
// ================================

/** Default tracer for module-level withSpan usage. */
let defaultStore: SpanStore | undefined;
let defaultTracer: Tracer | undefined;

/** Initialize the default tracer (call once per process). */
export function initTracer(options?: SpanStoreOptions): Tracer {
  defaultStore = createSpanStore(options);
  defaultTracer = createTracer(defaultStore);
  return defaultTracer;
}

/** Get the default span store (for devtools). */
export function getDefaultStore(): SpanStore | undefined {
  return defaultStore;
}

/**
 * Execute an async function wrapped in a traced span.
 *
 * Automatically handles:
 * - Span lifecycle (start, end)
 * - Status (ok on success, error on throw)
 * - E2E latency calculation if `_trace` is present in attributes
 * - Attribute cleanup (removes undefined values and _trace)
 *
 * @example
 * await withSpan(spanNames.cdc.processWal, { lsn, entityType }, async (ctx) => {
 *   // Core logic here
 *   sendActivityToApi(activity, ctx);
 * });
 */
export async function withSpan<T>(
  name: string,
  attrs: SpanAttributes,
  fn: (ctx: TraceContext) => Promise<T>,
  tracer?: Tracer,
): Promise<T> {
  const t = tracer ?? defaultTracer;
  if (!t) {
    throw new Error('Tracer not initialized. Call initTracer() first or pass a tracer.');
  }

  // Extract trace context before cleaning attributes
  const { _trace, ...rawAttrs } = attrs;

  // Clean attributes: keep only primitive values (strings, numbers, booleans, null)
  const cleanAttrs: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(rawAttrs)) {
    if (value !== undefined && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)) {
      cleanAttrs[key] = value;
    }
  }

  const span = t.startSpan(name, { attributes: cleanAttrs });

  // Auto-calculate e2e latency if trace context is present
  if (_trace?.cdcTimestamp) {
    span.setAttribute('e2e_latency_ms', Date.now() - _trace.cdcTimestamp);
    if (_trace.traceId) span.setAttribute('cdc_trace_id', _trace.traceId);
  }

  try {
    const result = await fn(span.getTraceContext());
    span.setStatus('ok');
    return result;
  } catch (error) {
    span.recordError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Execute a sync function wrapped in a traced span.
 *
 * Same as withSpan but for synchronous operations.
 */
export function withSpanSync<T>(
  name: string,
  attrs: SpanAttributes,
  fn: (ctx: TraceContext) => T,
  tracer?: Tracer,
): T {
  const t = tracer ?? defaultTracer;
  if (!t) {
    throw new Error('Tracer not initialized. Call initTracer() first or pass a tracer.');
  }

  const { _trace, ...rawAttrs } = attrs;

  // Clean attributes: keep only primitive values
  const cleanAttrs: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(rawAttrs)) {
    if (value !== undefined && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)) {
      cleanAttrs[key] = value;
    }
  }

  const span = t.startSpan(name, { attributes: cleanAttrs });

  if (_trace?.cdcTimestamp) {
    span.setAttribute('e2e_latency_ms', Date.now() - _trace.cdcTimestamp);
    if (_trace.traceId) span.setAttribute('cdc_trace_id', _trace.traceId);
  }

  try {
    const result = fn(span.getTraceContext());
    span.setStatus('ok');
    return result;
  } catch (error) {
    span.recordError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
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
  entityId?: string | null;
  entityType?: string | null;
}

/** Build prefixed activity attributes from an activity object. */
export function activityAttrs(input: ActivityInput): CleanSpanAttributes {
  return {
    'activity.type': input.type ?? 'unknown',
    'activity.action': input.action ?? 'unknown',
    'activity.entityId': input.entityId ?? 'unknown',
    'activity.entityType': input.entityType ?? null,
  };
}

/** Input for event attributes (activity event in bus context). */
export interface EventInput {
  type: string;
  entityId?: string | null;
  entityType?: string | null;
}

/** Build prefixed event attributes for ActivityBus spans. */
export function eventAttrs(input: EventInput): CleanSpanAttributes {
  return {
    'event.type': input.type,
    'event.entityId': input.entityId ?? null,
    'event.entityType': input.entityType ?? null,
  };
}
