/**
 * CDC Worker tracing module.
 *
 * Thin wrapper around @cella/tracing with CDC-specific metrics.
 */

import {
  activityAttrs,
  cdcAttrs,
  cdcSpanNames,
  createSpanStore,
  createTracer,
  withSpan as sharedWithSpan,
  type SpanAttributes,
  type SpanData,
  type TraceContext,
} from '@cella/tracing';
import { logEvent } from '#/utils/logger';

// Re-export span names and attribute helpers from shared package
export { activityAttrs, cdcAttrs, cdcSpanNames };
export type { TraceContext };

// ================================
// Span Store with logging
// ================================

const spanStore = createSpanStore({
  maxSpans: 100,
  onSpanEnd: (span) => {
    logEvent('debug', `Span: ${span.name}`, {
      duration: `${span.duration}ms`,
      status: span.status,
      ...span.attributes,
    });
  },
});

const tracer = createTracer(spanStore);

// ================================
// Metrics
// ================================

const metrics = {
  messagesProcessed: 0,
  activitiesCreated: 0,
  wsSendSuccess: 0,
  wsSendFailed: 0,
  errors: 0,
  lastProcessedAt: null as number | null,
};

/** Record a CDC metric. */
export function recordCdcMetric(metric: keyof typeof metrics): void {
  if (metric === 'lastProcessedAt') {
    metrics.lastProcessedAt = Date.now();
  } else if (typeof metrics[metric] === 'number') {
    (metrics[metric] as number)++;
  }
}

/** Get CDC metrics summary. */
export function getCdcMetrics(): typeof metrics & { recentSpanCount: number } {
  return { ...metrics, recentSpanCount: spanStore.length };
}

/** Get recent spans for debugging. */
export function getRecentSpans(): SpanData[] {
  return spanStore.getSpans();
}

/** Clear metrics and spans. */
export function resetCdcTracing(): void {
  spanStore.clear();
  metrics.messagesProcessed = 0;
  metrics.activitiesCreated = 0;
  metrics.wsSendSuccess = 0;
  metrics.wsSendFailed = 0;
  metrics.errors = 0;
  metrics.lastProcessedAt = null;
}

// ================================
// withSpan (uses local tracer)
// ================================

/**
 * Execute an async function within a traced CDC span.
 */
export async function withSpan<T>(
  name: string,
  attrs: SpanAttributes,
  fn: (ctx: TraceContext) => Promise<T>,
): Promise<T> {
  return sharedWithSpan(name, attrs, fn, tracer);
}

logEvent('info', 'CDC tracing initialized');
