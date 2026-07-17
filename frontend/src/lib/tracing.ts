import { type Span, SpanStatusCode } from '@opentelemetry/api';
import type { IncomingTraceContext, SpanData, SpanStats, TraceContext } from 'shared/tracing';
import { frontendSpanNames } from 'shared/tracing';
import { isDebugMode } from '~/env';
import { spanStore, tracer } from './otel';

export type { SpanData };
export { frontendSpanNames as syncSpanNames };

// Public API for devtools

export function getSpans(): SpanData[] {
  return spanStore.getSpans();
}

export function getSpansByPrefix(prefix: string): SpanData[] {
  return spanStore.getSpansByPrefix(prefix);
}

export function subscribeToSpans(callback: (spans: SpanData[]) => void): () => void {
  return spanStore.subscribe(callback);
}

export function clearSpans(): void {
  spanStore.clear();
}

export function getSpanStats(): SpanStats {
  return spanStore.getStats();
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
    span.setAttribute('e2e_latency_ms', Date.now() - _trace.cdcTimestamp);
    if (_trace.traceId) span.setAttribute('cdc_trace_id', _trace.traceId);
  }
}

// withSpan helpers

export async function withSpan<T>(name: string, attrs: SpanAttrs, fn: (ctx: TraceContext) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    applyAttrs(span, attrs);
    try {
      const ctx: TraceContext = {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        cdcTimestamp: Date.now(),
      };
      const result = await fn(ctx);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
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
    const ctx: TraceContext = {
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      cdcTimestamp: Date.now(),
    };
    const result = fn(ctx);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

export function startSyncSpan(name: string, attributes?: Record<string, string | number | boolean | null>): Span {
  const span = tracer.startSpan(name);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== null) {
        span.setAttribute(key, value);
      }
    }
  }
  return span;
}

/**
 * Record a critical client failure as an immediate error-status span so it
 * reaches Maple error analytics/alerting (span-based), independent of the
 * session-replay timeline. Use for swallowed-but-serious failures: offline
 * cache restore, mutation quarantine, upload sync, realtime catchup.
 */
export function reportCriticalError(name: string, err: unknown, attrs: SpanAttrs = {}): void {
  const span = tracer.startSpan(`client.${name}`);
  applyAttrs(span, attrs);
  const error = err instanceof Error ? err : new Error(String(err));
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  span.end();
}

if (isDebugMode) {
  console.debug('[tracing] Frontend OTel tracing initialized');
}
