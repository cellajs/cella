import { SpanStatusCode } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace';
import type { CleanSpanAttributes, SpanData, SpanStore } from './tracing.ts';

export interface SpanStoreProcessorOptions {
  store?: SpanStore;
  onSpanEnd?: (data: SpanData) => void;
}

function hrTimeToMs(hrTime: [number, number]): number {
  return hrTime[0] * 1000 + hrTime[1] / 1_000_000;
}

function readableSpanToSpanData(span: ReadableSpan): SpanData {
  const ctx = span.spanContext();
  const startTime = hrTimeToMs(span.startTime);
  const endTime = hrTimeToMs(span.endTime);

  const attributes: CleanSpanAttributes = {};
  for (const [key, value] of Object.entries(span.attributes)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
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
    status: span.status.code === SpanStatusCode.ERROR ? 'error' : span.status.code === SpanStatusCode.OK ? 'ok' : 'unset',
    events: span.events.map((event) => ({ name: event.name, time: hrTimeToMs(event.time), attributes: event.attributes })),
  };
}

/**
 * Converts each ReadableSpan to SpanData, pushing it into a SpanStore and firing the callback,
 * so the frontend devtools UI and CDC debug logging both read OTel spans.
 */
export function createSpanStoreProcessor(options: SpanStoreProcessorOptions): SpanProcessor {
  const { store, onSpanEnd } = options;

  return {
    onStart(): void {},
    onEnd(span: ReadableSpan): void {
      const data = readableSpanToSpanData(span);
      store?.addSpan(data);
      onSpanEnd?.(data);
    },
    async forceFlush(): Promise<void> {},
    async shutdown(): Promise<void> {},
  };
}
