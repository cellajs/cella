import { type Span, SpanStatusCode } from '@opentelemetry/api';
import type { SpanData, TraceContext } from 'shared/tracing';
import { isDebugMode } from '~/env';
import { spanStore, tracer } from '~/lib/otel';

export type { SpanData };

export function getSpans(): SpanData[] {
  return spanStore.getSpans();
}

export function subscribeToSpans(callback: (spans: SpanData[]) => void): () => void {
  return spanStore.subscribe(callback);
}

export function clearSpans(): void {
  spanStore.clear();
}

type SpanAttributes = Record<string, string | number | boolean | null | undefined>;

function applyAttributes(span: Span, attributes: SpanAttributes): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) span.setAttribute(key, value);
  }
}

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
export async function withSpan<T>(name: string, attributes: SpanAttributes, fn: (context: TraceContext) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    applyAttributes(span, attributes);
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

export function withSpanSync<T>(name: string, attributes: SpanAttributes, fn: (context: TraceContext) => T): T {
  const span = tracer.startSpan(name);
  applyAttributes(span, attributes);
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
 * Starts a sync engine span, named from `frontendSpanNames`, that the caller ends.
 * @public
 */
export function startSyncSpan(name: string, attributes: SpanAttributes = {}): Span {
  const span = tracer.startSpan(name);
  applyAttributes(span, attributes);
  return span;
}

/** Record a swallowed critical failure as an immediate error span for Maple alerting. */
export function reportCriticalError(name: string, error: unknown, attributes: SpanAttributes = {}): void {
  const span = tracer.startSpan(`client.${name}`);
  applyAttributes(span, attributes);
  failSpan(span, error);
  span.end();
}

if (isDebugMode) {
  console.debug('[tracing] Frontend OTel tracing initialized');
}
