import { SpanStatusCode } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it, vi } from 'vitest';
import { createSpanStore } from './tracing';
import { createSpanStoreProcessor } from './span-store-processor';

/** Build a minimal ReadableSpan mock for testing. */
function mockReadableSpan(overrides: Partial<{
  traceId: string;
  spanId: string;
  parentSpanId: string;
  name: string;
  startTime: [number, number];
  endTime: [number, number];
  status: { code: number; message?: string };
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; time: [number, number]; attributes?: Record<string, unknown> }>;
}> = {}): ReadableSpan {
  const traceId = overrides.traceId ?? 'abc123';
  const spanId = overrides.spanId ?? 'def456';
  const parentSpanId = overrides.parentSpanId;

  return {
    name: overrides.name ?? 'test.operation',
    kind: 0,
    spanContext: () => ({ traceId, spanId, traceFlags: 1, isRemote: false }),
    parentSpanContext: parentSpanId ? { traceId, spanId: parentSpanId, traceFlags: 1 } : undefined,
    startTime: overrides.startTime ?? [1000, 0],
    endTime: overrides.endTime ?? [1000, 50_000_000],
    status: overrides.status ?? { code: SpanStatusCode.OK },
    attributes: overrides.attributes ?? {},
    links: [],
    events: overrides.events ?? [],
    duration: [0, 50_000_000],
    ended: true,
    resource: { attributes: {} },
    instrumentationScope: { name: 'test' },
    instrumentationLibrary: { name: 'test' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  } as unknown as ReadableSpan;
}

describe('createSpanStoreProcessor', () => {
  it('pushes converted spans to store on onEnd', () => {
    const store = createSpanStore();
    const processor = createSpanStoreProcessor({ store });

    processor.onEnd(mockReadableSpan({ name: 'cdc.wal.process' }));

    const spans = store.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('cdc.wal.process');
    expect(spans[0].traceId).toBe('abc123');
    expect(spans[0].spanId).toBe('def456');
  });

  it('fires onSpanEnd callback with converted SpanData', () => {
    const onSpanEnd = vi.fn();
    const processor = createSpanStoreProcessor({ onSpanEnd });

    processor.onEnd(mockReadableSpan({ name: 'sync.sse.send' }));

    expect(onSpanEnd).toHaveBeenCalledOnce();
    expect(onSpanEnd.mock.calls[0][0].name).toBe('sync.sse.send');
  });

  it('maps parentSpanContext to parentSpanId', () => {
    const store = createSpanStore();
    const processor = createSpanStoreProcessor({ store });

    processor.onEnd(mockReadableSpan({ parentSpanId: 'parent-abc' }));

    expect(store.getSpans()[0].parentSpanId).toBe('parent-abc');
  });

  it('omits parentSpanId when no parent context', () => {
    const store = createSpanStore();
    const processor = createSpanStoreProcessor({ store });

    processor.onEnd(mockReadableSpan());

    expect(store.getSpans()[0].parentSpanId).toBeUndefined();
  });

  it('converts HrTime to milliseconds', () => {
    const store = createSpanStore();
    const processor = createSpanStoreProcessor({ store });

    // startTime: 2 seconds + 500ms = 2500ms
    // endTime: 2 seconds + 600ms = 2600ms
    processor.onEnd(mockReadableSpan({
      startTime: [2, 500_000_000],
      endTime: [2, 600_000_000],
    }));

    const span = store.getSpans()[0];
    expect(span.startTime).toBe(2500);
    expect(span.endTime).toBe(2600);
    expect(span.duration).toBe(100);
  });

  it('maps status codes correctly', () => {
    const store = createSpanStore();
    const processor = createSpanStoreProcessor({ store });

    processor.onEnd(mockReadableSpan({ status: { code: SpanStatusCode.UNSET } }));
    processor.onEnd(mockReadableSpan({ status: { code: SpanStatusCode.OK } }));
    processor.onEnd(mockReadableSpan({ status: { code: SpanStatusCode.ERROR } }));

    const spans = store.getSpans();
    expect(spans[0].status).toBe('unset');
    expect(spans[1].status).toBe('ok');
    expect(spans[2].status).toBe('error');
  });

  it('converts attributes, filtering out undefined values', () => {
    const store = createSpanStore();
    const processor = createSpanStoreProcessor({ store });

    processor.onEnd(mockReadableSpan({
      attributes: { lsn: '0/1234', count: 42, active: true },
    }));

    expect(store.getSpans()[0].attributes).toEqual({
      lsn: '0/1234',
      count: 42,
      active: true,
    });
  });

  it('converts span events', () => {
    const store = createSpanStore();
    const processor = createSpanStoreProcessor({ store });

    processor.onEnd(mockReadableSpan({
      events: [{ name: 'exception', time: [1, 0], attributes: { 'exception.message': 'boom' } }],
    }));

    const events = store.getSpans()[0].events;
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('exception');
    expect(events[0].time).toBe(1000);
    expect(events[0].attributes).toEqual({ 'exception.message': 'boom' });
  });

  it('works with both store and onSpanEnd together', () => {
    const store = createSpanStore();
    const onSpanEnd = vi.fn();
    const processor = createSpanStoreProcessor({ store, onSpanEnd });

    processor.onEnd(mockReadableSpan());

    expect(store.getSpans()).toHaveLength(1);
    expect(onSpanEnd).toHaveBeenCalledOnce();
  });

  it('forceFlush and shutdown resolve without error', async () => {
    const processor = createSpanStoreProcessor({});
    await expect(processor.forceFlush()).resolves.toBeUndefined();
    await expect(processor.shutdown()).resolves.toBeUndefined();
  });
});
