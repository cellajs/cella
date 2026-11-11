import { type Span, SpanStatusCode } from '@opentelemetry/api';
import type { CleanSpanAttributes, SpanData, TraceContext } from 'shared/tracing';
import { isDebugMode } from '~/env';
import { spanStore, tracer } from '~/lib/otel';
import { settleWithin } from '~/utils/wait-for';

export type { SpanData };

export const getSpans = (): SpanData[] => spanStore.getSpans();

export const subscribeToSpans = (callback: (spans: SpanData[]) => void): (() => void) => spanStore.subscribe(callback);

export const clearSpans = (): void => spanStore.clear();

function applyAttributes(span: Span, attributes: CleanSpanAttributes): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null) span.setAttribute(key, value);
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
export const withSpan = async <T>(name: string, attributes: CleanSpanAttributes, fn: (context: TraceContext) => Promise<T>): Promise<T> =>
  tracer.startActiveSpan(name, async (span) => {
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

export const withSpanSync = <T>(name: string, attributes: CleanSpanAttributes, fn: (context: TraceContext) => T): T => {
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
};

/**
 * Starts a sync engine span, named from `frontendSpanNames`, that the caller ends.
 * @public
 */
export const startSyncSpan = (name: string, attributes: CleanSpanAttributes = {}): Span => {
  const span = tracer.startSpan(name);
  applyAttributes(span, attributes);
  return span;
};

/** Record a swallowed critical failure as an immediate error span for Maple alerting. */
export const reportCriticalError = (name: string, error: unknown, attributes: CleanSpanAttributes = {}): void => {
  const span = tracer.startSpan(`client.${name}`);
  applyAttributes(span, attributes);
  failSpan(span, error);
  span.end();
};

/** Logs a step that did not answer in time and records it as an error span naming the step. */
export const reportUnanswered = (step: string, ms: number): void => {
  console.warn(`[${step}] No answer within ${ms} ms`);
  reportCriticalError('unanswered', new Error(`${step} did not answer within ${ms} ms`), { step });
};

/** Waits for a step at most `ms` and never rejects: resolves whether it succeeded by then. A failure is logged, a wait that ran out reported. */
export const settleOrReport = async (step: string, ms: number, promise: Promise<unknown>): Promise<boolean> => {
  const succeeded = promise.then(
    () => true,
    (error) => {
      console.error(`[${step}]`, error);
      return false;
    },
  );
  if (await settleWithin(ms, succeeded)) return succeeded;
  reportUnanswered(step, ms);
  return false;
};

if (isDebugMode) console.debug('[tracing] Frontend OTel tracing initialized');
