import { type Span, trace } from '@opentelemetry/api';
import type { EntityType } from 'shared';
import { backendSpanNames, eventAttrs, remoteParentContext, type TraceContext } from 'shared/tracing';
import { otel } from '#/lib/tracing';

const meterProvider = otel.meterProvider;

export { backendSpanNames as syncSpanNames, eventAttrs };
export type SyncTraceContext = TraceContext;

// OTel metrics

const meter = meterProvider.getMeter('app-sync');

const cdcMessagesReceived = meter.createCounter('sync.cdc.messages_received', {
  description: 'Messages received from CDC Worker via WebSocket',
});

// OTel tracer

const tracer = trace.getTracer('app-sync');

/**
 * Start a sync span; the caller ends it.
 * @param name - Span name, from `syncSpanNames`.
 * @param attributes - Span attributes; null values are left off.
 * @param parent - The CDC span that sent the message. The span then joins that span's trace as its child.
 * @returns The started span.
 */
export function startSyncSpan(name: string, attributes?: Record<string, string | number | boolean | null>, parent?: SyncTraceContext | null): Span {
  const span = tracer.startSpan(name, {}, parent ? remoteParentContext(parent) : undefined);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) {
        span.setAttribute(key, value);
      }
    }
  }
  return span;
}

// Metric recording

export function recordMessageReceived(entityType: EntityType | 'unknown'): void {
  cdcMessagesReceived.add(1, { entityType });
}
