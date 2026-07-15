import { describe, expect, it, vi } from 'vitest';
import {
  activityAttrs,
  cdcAttrs,
  computeSpanStats,
  createSpanStore,
  eventAttrs,
  type SpanData,
} from './tracing';

function makeSpan(overrides: Partial<SpanData> = {}): SpanData {
  return {
    traceId: 'trace-1',
    spanId: 'span-1',
    name: 'test.span',
    startTime: 1000,
    endTime: 1050,
    duration: 50,
    attributes: {},
    status: 'ok',
    events: [],
    ...overrides,
  };
}

describe('createSpanStore', () => {
  it('adds and retrieves spans', () => {
    const store = createSpanStore();
    const span = makeSpan();
    store.addSpan(span);

    expect(store.getSpans()).toEqual([span]);
    expect(store.length).toBe(1);
  });

  it('evicts oldest spans when maxSpans is exceeded', () => {
    const store = createSpanStore({ maxSpans: 2 });
    store.addSpan(makeSpan({ spanId: 'a' }));
    store.addSpan(makeSpan({ spanId: 'b' }));
    store.addSpan(makeSpan({ spanId: 'c' }));

    const spans = store.getSpans();
    expect(spans).toHaveLength(2);
    expect(spans[0].spanId).toBe('b');
    expect(spans[1].spanId).toBe('c');
  });

  it('filters spans by prefix', () => {
    const store = createSpanStore();
    store.addSpan(makeSpan({ name: 'cdc.wal.process' }));
    store.addSpan(makeSpan({ name: 'sync.sse.connect' }));
    store.addSpan(makeSpan({ name: 'cdc.activity.create' }));

    expect(store.getSpansByPrefix('cdc.')).toHaveLength(2);
    expect(store.getSpansByPrefix('sync.')).toHaveLength(1);
    expect(store.getSpansByPrefix('nope')).toHaveLength(0);
  });

  it('notifies subscribers on addSpan', () => {
    const store = createSpanStore();
    const callback = vi.fn();
    store.subscribe(callback);

    // subscribe fires immediately with current spans
    expect(callback).toHaveBeenCalledWith([]);

    const span = makeSpan();
    store.addSpan(span);
    expect(callback).toHaveBeenCalledWith([span]);
  });

  it('unsubscribes correctly', () => {
    const store = createSpanStore();
    const callback = vi.fn();
    const unsubscribe = store.subscribe(callback);

    callback.mockClear();
    unsubscribe();

    store.addSpan(makeSpan());
    expect(callback).not.toHaveBeenCalled();
  });

  it('fires onSpanEnd callback', () => {
    const onSpanEnd = vi.fn();
    const store = createSpanStore({ onSpanEnd });
    const span = makeSpan();

    store.addSpan(span);
    expect(onSpanEnd).toHaveBeenCalledWith(span);
  });

  it('clears all spans and notifies subscribers', () => {
    const store = createSpanStore();
    store.addSpan(makeSpan());
    store.addSpan(makeSpan({ spanId: 'b' }));

    const callback = vi.fn();
    store.subscribe(callback);
    callback.mockClear();

    store.clear();
    expect(store.length).toBe(0);
    expect(store.getSpans()).toEqual([]);
    expect(callback).toHaveBeenCalledWith([]);
  });

  it('returns a snapshot, not a reference', () => {
    const store = createSpanStore();
    store.addSpan(makeSpan());

    const spans = store.getSpans();
    spans.push(makeSpan({ spanId: 'injected' }));

    expect(store.getSpans()).toHaveLength(1);
  });
});

describe('computeSpanStats', () => {
  it('computes stats from spans', () => {
    const spans = [
      makeSpan({ name: 'cdc.wal.process', duration: 10, status: 'ok' }),
      makeSpan({ name: 'cdc.wal.send', duration: 20, status: 'ok' }),
      makeSpan({ name: 'sync.sse.connect', duration: 30, status: 'error' }),
    ];

    const stats = computeSpanStats(spans);
    expect(stats.total).toBe(3);
    expect(stats.errorCount).toBe(1);
    expect(stats.byPrefix['cdc.wal']).toBe(2);
    expect(stats.byPrefix['sync.sse']).toBe(1);
    expect(stats.avgDurationMs['cdc.wal']).toBe(15);
    expect(stats.avgDurationMs['sync.sse']).toBe(30);
  });

  it('handles spans with null duration', () => {
    const spans = [makeSpan({ name: 'test.span', duration: null, endTime: null })];
    const stats = computeSpanStats(spans);

    expect(stats.total).toBe(1);
    expect(stats.avgDurationMs).toEqual({});
  });

  it('returns zero stats for empty array', () => {
    const stats = computeSpanStats([]);
    expect(stats).toEqual({ total: 0, byPrefix: {}, avgDurationMs: {}, errorCount: 0 });
  });
});

describe('attribute helpers', () => {
  it('cdcAttrs builds correct attributes', () => {
    expect(cdcAttrs({ lsn: '0/1234' })).toEqual({
      lsn: '0/1234',
      'cdc.tag': 'unknown',
      'cdc.table': 'unknown',
    });

    expect(cdcAttrs({ lsn: '0/5678', tag: 'INSERT', table: 'tasks' })).toEqual({
      lsn: '0/5678',
      'cdc.tag': 'INSERT',
      'cdc.table': 'tasks',
    });
  });

  it('activityAttrs builds correct attributes', () => {
    expect(activityAttrs({})).toEqual({
      'activity.type': 'unknown',
      'activity.action': 'unknown',
      'activity.subjectId': 'unknown',
      'activity.entityType': null,
    });

    expect(activityAttrs({ type: 'entity', action: 'create', subjectId: 'abc', entityType: 'attachment' })).toEqual({
      'activity.type': 'entity',
      'activity.action': 'create',
      'activity.subjectId': 'abc',
      'activity.entityType': 'attachment',
    });
  });

  it('eventAttrs builds correct attributes', () => {
    expect(eventAttrs({ type: 'create' })).toEqual({
      'event.type': 'create',
      'event.subjectId': null,
      'event.entityType': null,
    });

    expect(eventAttrs({ type: 'update', subjectId: 'x', entityType: 'attachment' })).toEqual({
      'event.type': 'update',
      'event.subjectId': 'x',
      'event.entityType': 'attachment',
    });
  });
});
