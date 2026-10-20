import { describe, expect, it } from 'vitest';
import { Metrics } from '../runner/metrics';

describe('Metrics', () => {
  it('keeps sub-millisecond latencies: values are recorded in microseconds', () => {
    const metrics = new Metrics();
    for (const value of [0.25, 0.5, 1.5, 2.5]) metrics.histogram('lat', value);
    const d = metrics.distribution('lat');
    expect(d?.count).toBe(4);
    expect(d?.min).toBeCloseTo(0.25, 2);
    expect(d?.max).toBeCloseTo(2.5, 2);
    expect(d?.p50).toBeCloseTo(0.5, 2);
  });

  it('starts every interval fresh and keeps the whole run', () => {
    const metrics = new Metrics();
    metrics.counter('rows', 3);
    metrics.histogram('lat', 10);
    expect(metrics.tick()).toEqual({ counters: { rows: 3 }, histograms: { lat: expect.objectContaining({ count: 1 }) } });
    metrics.counter('rows');
    expect(metrics.tick()).toEqual({ counters: { rows: 1 }, histograms: {} });
    expect(metrics.get('rows')).toBe(4);
    expect(metrics.distribution('lat')?.count).toBe(1);
  });

  it('counts responses per endpoint and in the run totals', () => {
    const metrics = new Metrics();
    metrics.response('GET /me', 200, 4, 5);
    metrics.response('GET /me', 401, 2, 3);
    metrics.response('PUT /x', 204, 8);
    const endpoints = metrics.endpointSummaries();
    expect(endpoints['GET /me']).toMatchObject({ codes: { 200: 1, 401: 1 }, nonOk: 1 });
    expect(endpoints['PUT /x'].total.count).toBe(0);
    expect(metrics.get('http.codes.200')).toBe(1);
    expect(metrics.distribution('http.response_time')?.count).toBe(3);
    expect(metrics.distribution('http.total_time')?.count).toBe(2);
  });
});
