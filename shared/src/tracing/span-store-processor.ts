import type { Context } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { SpanData, SpanStore } from './tracing';

export interface SpanStoreProcessorOptions {
  /** SpanStore to push completed spans into. */
  store?: SpanStore;
  /** Callback fired when a span ends (for debug logging). */
  onSpanEnd?: (data: SpanData) => void;
}

function hrTimeToMs(hrTime: [number, number]): number {
  return hrTime[0] * 1000 + hrTime[1] / 1_000_000;
}

function readableSpanToSpanData(span: ReadableSpan): SpanData {
  const ctx = span.spanContext();
  const startTime = hrTimeToMs(span.startTime);
  const endTime = hrTimeToMs(span.endTime);

  const attributes: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(span.attributes)) {
    if (value !== undefined && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
      attributes[key] = value;
    }
  }

  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: span.parentSpanContext?.spanId,
    name: span.name,
    startTime,
    endTime,
    duration: endTime - startTime,
    attributes,
    status: span.status.code === 2 ? 'error' : span.status.code === 1 ? 'ok' : 'unset',
    events: span.events.map((e) => ({
      name: e.name,
      time: hrTimeToMs(e.time),
      attributes: e.attributes as Record<string, unknown> | undefined,
    })),
  };
}

/**
 * Bridges OTel spans into the SpanStore: converts each ReadableSpan to SpanData and pushes
 * it into a SpanStore and/or fires a callback, so devtools UI (frontend) and debug logging
 * (CDC) can consume OTel spans transparently.
 */
export function createSpanStoreProcessor(options: SpanStoreProcessorOptions): SpanProcessor {
  const { store, onSpanEnd } = options;

  return {
    onStart(_span: ReadableSpan, _parentContext: Context): void {},
    onEnd(span: ReadableSpan): void {
      const data = readableSpanToSpanData(span);
      store?.addSpan(data);
      onSpanEnd?.(data);
    },
    async forceFlush(): Promise<void> {},
    async shutdown(): Promise<void> {},
  };
}
