import { type Span, SpanStatusCode } from '@opentelemetry/api';
import type { IncomingTraceContext, SpanData, TraceContext } from 'shared/tracing';
import { frontendSpanNames } from 'shared/tracing';
import { isDebugMode } from '~/env';
import { spanStore, tracer } from './otel';

export type { SpanData };
export { frontendSpanNames as syncSpanNames };

// Public API for devtools

export function getSpans(): SpanData[] {
  return spanStore.getSpans();
}

export function subscribeToSpans(callback: (spans: SpanData[]) => void): () => void {
  return spanStore.subscribe(callback);
}

export function clearSpans(): void {
  spanStore.clear();
}

// Span attribute helpers

interface SpanAttrs {
  [key: string]: string | number | boolean | null | undefined | IncomingTraceContext;
  _trace?: IncomingTraceContext;
}

function applyAttrs(span: Span, attrs: SpanAttrs): void {
  const { _trace, ...rest } = attrs;
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null && typeof value !== 'object') {
      span.setAttribute(key, value);
    }
  }
  if (_trace?.cdcTimestamp) {
    span.setAttribute('sync.e2e_latency_ms', Date.now() - _trace.cdcTimestamp);
    if (_trace.traceId) span.setAttribute('sync.cdc_trace_id', _trace.traceId);
  }
}

// withSpan helpers

function failSpan(span: Span, error: unknown): void {
  const exception = error instanceof Error ? error : new Error(String(error));
  span.recordException(exception);
  span.setStatus({ code: SpanStatusCode.ERROR, message: exception.message });
}

function traceContext(span: Span): TraceContext {
  const { traceId, spanId } = span.spanContext();
  return { traceId, spanId, cdcTimestamp: Date.now() };
}

/** @public */
export async function withSpan<T>(name: string, attrs: SpanAttrs, fn: (ctx: TraceContext) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    applyAttrs(span, attrs);
    try {
      const result = await fn(traceContext(span));
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      failSpan(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
}

export function withSpanSync<T>(name: string, attrs: SpanAttrs, fn: (ctx: TraceContext) => T): T {
  const span = tracer.startSpan(name);
  applyAttrs(span, attrs);
  try {
    const result = fn(traceContext(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    failSpan(span, error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Starts a sync engine span, named from `syncSpanNames`, that the caller ends.
 * @public
 */
export function startSyncSpan(name: string, attributes: SpanAttrs = {}): Span {
  const span = tracer.startSpan(name);
  applyAttrs(span, attributes);
  return span;
}

/** Record a swallowed critical failure as an immediate error span for Maple alerting. */
export function reportCriticalError(name: string, err: unknown, attrs: SpanAttrs = {}): void {
  const span = tracer.startSpan(`client.${name}`);
  applyAttrs(span, attrs);
  failSpan(span, err);
  span.end();
}

if (isDebugMode) {
  console.debug('[tracing] Frontend OTel tracing initialized');
}
