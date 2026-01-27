/**
 * Frontend tracing module.
 *
 * Thin wrapper around @cella/tracing with frontend-specific store.
 * Spans are stored in memory and accessible via SyncDevtools.
 */

import {
  createSpanStore,
  createTracer,
  frontendSpanNames,
  type LightweightSpan,
  type SpanAttributes,
  type SpanData,
  type SpanStats,
  withSpan as sharedWithSpan,
  withSpanSync as sharedWithSpanSync,
  type TraceContext,
} from '@cella/tracing';
import { isDebugMode } from '~/env';

// Re-export span names (aliased for backwards compatibility)
export { frontendSpanNames as syncSpanNames };
export type { SpanData, SpanStats, LightweightSpan };

// ================================
// Span Store
// ================================

const spanStore = createSpanStore({ maxSpans: 500 });
const tracer = createTracer(spanStore);

// ================================
// Public API for devtools
// ================================

/** Get all stored spans. */
export function getSpans(): SpanData[] {
  return spanStore.getSpans();
}

/** Get spans by name prefix. */
export function getSpansByPrefix(prefix: string): SpanData[] {
  return spanStore.getSpansByPrefix(prefix);
}

/** Subscribe to span updates. Returns unsubscribe function. */
export function subscribeToSpans(callback: (spans: SpanData[]) => void): () => void {
  return spanStore.subscribe(callback);
}

/** Clear all stored spans. */
export function clearSpans(): void {
  spanStore.clear();
}

/** Get span statistics. */
export function getSpanStats(): SpanStats {
  return spanStore.getStats();
}

// ================================
// withSpan helpers (use local tracer)
// ================================

/**
 * Execute an async function within a traced span.
 * Auto-calculates e2e latency if `_trace` is present.
 */
export async function withSpan<T>(
  name: string,
  attrs: SpanAttributes,
  fn: (ctx: TraceContext) => Promise<T>,
): Promise<T> {
  return sharedWithSpan(name, attrs, fn, tracer);
}

/**
 * Execute a sync function within a traced span.
 * Auto-calculates e2e latency if `_trace` is present.
 */
export function withSpanSync<T>(name: string, attrs: SpanAttributes, fn: (ctx: TraceContext) => T): T {
  return sharedWithSpanSync(name, attrs, fn, tracer);
}

/**
 * Start a span manually (for cases where withSpan doesn't fit).
 */
export function startSyncSpan(
  name: string,
  attributes?: Record<string, string | number | boolean | null>,
): LightweightSpan {
  return tracer.startSpan(name, { attributes });
}

if (isDebugMode) {
  console.debug('[tracing] Frontend tracing initialized');
}
