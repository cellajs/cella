import { type Span, SpanStatusCode, trace } from '@opentelemetry/api';
import type { EntityType } from 'shared';
import { backendSpanNames, eventAttrs, type TraceContext } from 'shared/tracing';
import { otel } from '#/lib/tracing';

const meterProvider = otel.meterProvider;

export type { Span };
// Re-export span names and attribute helpers
export { backendSpanNames as syncSpanNames, eventAttrs };
export type SyncTraceContext = TraceContext;

// OTel metrics

const meter = meterProvider.getMeter('app-sync');

export const cdcMessagesReceived = meter.createCounter('sync.cdc.messages_received', {
  description: 'Messages received from CDC Worker via WebSocket',
});

export const sseNotificationsSent = meter.createCounter('sync.sse.notifications_sent', {
  description: 'Notifications sent to clients via SSE stream',
});

export const sseActiveConnections = meter.createUpDownCounter('sync.sse.active_connections', {
  description: 'Number of active SSE connections',
});

export const sseCatchUpDuration = meter.createHistogram('sync.sse.catchup_duration_ms', {
  description: 'Time to complete SSE catch-up phase in milliseconds',
});

export const pgNotifyFallback = meter.createCounter('sync.pg_notify.fallback', {
  description: 'Times pg_notify was used as fallback (no CDC Worker)',
});

// OTel tracer

const tracer = trace.getTracer('app-sync');

// withSpan + startSyncSpan

interface SpanAttrs {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Execute an async function within a traced sync span.
 */
export async function withSpan<T>(name: string, attrs: SpanAttrs, fn: (ctx: TraceContext) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined && value !== null) {
        span.setAttribute(key, value);
      }
    }
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

/**
 * Start a span manually (for cases where withSpan doesn't fit).
 */
export function startSyncSpan(
  name: string,
  attributes?: Record<string, string | number | boolean | null>,
  _parentTraceId?: string,
): Span {
  const span = tracer.startSpan(name);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) {
        span.setAttribute(key, value);
      }
    }
  }
  if (_parentTraceId) {
    span.setAttribute('parent_trace_id', _parentTraceId);
  }
  return span;
}

// Metric recording

/** Record a CDC message received from CDC Worker. */
export function recordMessageReceived(entityType: EntityType | 'unknown'): void {
  cdcMessagesReceived.add(1, { entityType });
}
