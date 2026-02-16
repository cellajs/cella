/**
 * Backend sync metrics and tracing.
 *
 * Uses config/tracing for spans and adds OTel metrics integration.
 * Tracks CDC messages, ActivityBus events, and SSE notifications.
 *
 * Terminology:
 * - Messages: JSON payloads from CDC Worker via WebSocket
 * - Events: In-memory events emitted by ActivityBus
 * - Notifications: SSE payloads sent to clients
 */

import {
  backendSpanNames,
  createSpanStore,
  createTracer,
  eventAttrs,
  type LightweightSpan,
  type SpanAttributes,
  type SpanData,
  withSpan as sharedWithSpan,
  type TraceContext,
} from 'shared/tracing';
import { meterProvider } from '#/tracing';

// Re-export span names and attribute helpers
export { backendSpanNames as syncSpanNames, eventAttrs };
export type { SpanData, LightweightSpan };
export type SyncTraceContext = TraceContext;

// ================================
// OTel Metrics
// ================================

const meter = meterProvider.getMeter('cella-sync');

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

// ================================
// Span Store
// ================================

const spanStore = createSpanStore({ maxSpans: 200 });
const tracer = createTracer(spanStore);

// ================================
// withSpan (uses local tracer)
// ================================

/**
 * Execute an async function within a traced sync span.
 */
export async function withSpan<T>(
  name: string,
  attrs: SpanAttributes,
  fn: (ctx: TraceContext) => Promise<T>,
): Promise<T> {
  return sharedWithSpan(name, attrs, fn, tracer);
}

/**
 * Start a span manually (for cases where withSpan doesn't fit).
 */
export function startSyncSpan(
  name: string,
  attributes?: Record<string, string | number | boolean | null>,
  parentTraceId?: string,
): LightweightSpan {
  return tracer.startSpan(name, { attributes, parentSpanId: parentTraceId });
}

// ================================
// Metric Recording
// ================================

let messagesReceivedCount = 0;
let notificationsSentCount = 0;
let activeConnectionsCount = 0;
let pgNotifyFallbackCount = 0;

/** Record a CDC message received from CDC Worker. */
export function recordMessageReceived(entityType: string): void {
  messagesReceivedCount++;
  cdcMessagesReceived.add(1, { entityType });
}

/** Record a notification sent to client via SSE. */
export function recordNotificationSent(entityType: string): void {
  notificationsSentCount++;
  sseNotificationsSent.add(1, { entityType });
}

export function recordConnectionChange(delta: 1 | -1, streamType: string): void {
  activeConnectionsCount += delta;
  sseActiveConnections.add(delta, { streamType });
}

export function recordPgNotifyFallback(): void {
  pgNotifyFallbackCount++;
  pgNotifyFallback.add(1);
}

export function recordCatchUpDuration(durationMs: number, streamType: string): void {
  sseCatchUpDuration.record(durationMs, { streamType });
}

// ================================
// Metrics Snapshot
// ================================

interface SyncMetricsSnapshot {
  messagesReceived: number;
  notificationsSent: number;
  activeConnections: number;
  pgNotifyFallbacks: number;
  recentSpanCount: number;
  spansByName: Record<string, number>;
  avgDurationByName: Record<string, number>;
  errorCount: number;
}

export function getSyncMetrics(): SyncMetricsSnapshot {
  const stats = spanStore.getStats();
  const spans = spanStore.getSpans();

  const spansByName: Record<string, number> = {};
  const durationSums: Record<string, number> = {};
  const durationCounts: Record<string, number> = {};

  for (const span of spans) {
    spansByName[span.name] = (spansByName[span.name] || 0) + 1;
    if (span.duration != null) {
      durationSums[span.name] = (durationSums[span.name] || 0) + span.duration;
      durationCounts[span.name] = (durationCounts[span.name] || 0) + 1;
    }
  }

  const avgDurationByName: Record<string, number> = {};
  for (const name of Object.keys(durationSums)) {
    avgDurationByName[name] = Math.round(durationSums[name] / durationCounts[name]);
  }

  return {
    messagesReceived: messagesReceivedCount,
    notificationsSent: notificationsSentCount,
    activeConnections: activeConnectionsCount,
    pgNotifyFallbacks: pgNotifyFallbackCount,
    recentSpanCount: spanStore.length,
    spansByName,
    avgDurationByName,
    errorCount: stats.errorCount,
  };
}

export function getRecentSyncSpans(): SpanData[] {
  return spanStore.getSpans();
}

export function resetSyncMetrics(): void {
  spanStore.clear();
  messagesReceivedCount = 0;
  notificationsSentCount = 0;
  activeConnectionsCount = 0;
  pgNotifyFallbackCount = 0;
}
