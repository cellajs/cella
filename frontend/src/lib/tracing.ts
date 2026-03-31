/**
 * Frontend tracing module.
 *
 * Uses real OTel browser SDK (via ./otel.ts) for trace propagation.
 * SpanStore feeds devtools UI via SpanStoreProcessor.
 */

import { type Span, SpanStatusCode } from '@opentelemetry/api';
import {
  frontendSpanNames,
  type IncomingTraceContext,
  type SpanData,
  type SpanStats,
  type TraceContext,
} from 'shared/tracing';
import { isDebugMode } from '~/env';
import { spanStore, tracer } from './otel';

export type { SpanData };
export { frontendSpanNames as syncSpanNames };

// ================================
// Public API for devtools
// ================================

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

// ================================
// Span attribute helpers
// ================================

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

// ================================
// withSpan helpers
// ================================

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

if (isDebugMode) {
  console.debug('[tracing] Frontend OTel tracing initialized');
}
