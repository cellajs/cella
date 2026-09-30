import { type Span, trace } from '@opentelemetry/api';
import type { EntityType } from 'shared';
import { backendSpanNames, eventAttrs, type TraceContext } from 'shared/tracing';
import { otel } from '#/lib/tracing';

const meterProvider = otel.meterProvider;

export { backendSpanNames as syncSpanNames, eventAttrs };
export type SyncTraceContext = TraceContext;

// OTel metrics

const meter = meterProvider.getMeter('app-sync');

export const cdcMessagesReceived = meter.createCounter('sync.cdc.messages_received', {
  description: 'Messages received from CDC Worker via WebSocket',
});

// OTel tracer

const tracer = trace.getTracer('app-sync');

/** Start a sync span; the caller ends it. */
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

export function recordMessageReceived(entityType: EntityType | 'unknown'): void {
  cdcMessagesReceived.add(1, { entityType });
}
