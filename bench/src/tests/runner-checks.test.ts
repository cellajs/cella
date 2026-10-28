import { describe, expect, it } from 'vitest';
import { evaluateChecks } from '../runner/checks';
import type { Distribution } from '../runner/metrics';

const dist = (p95: number): Distribution => ({ count: 10, min: 1, mean: p95 / 2, p50: p95 / 2, p95, p99: p95 * 1.5, max: p95 * 2 });
const failed = (results: { ok: boolean; text: string }[]) => results.filter((result) => !result.ok).map((result) => result.text);

describe('evaluateChecks', () => {
  it('accepts a run whose responses are all 2xx', () => {
    expect(failed(evaluateChecks({}, { counters: { 'http.codes.200': 40, 'http.codes.204': 5 }, distributions: {}, short: false }))).toEqual([]);
  });

  it('names the statuses of a run the stack rejected', () => {
    expect(failed(evaluateChecks({}, { counters: { 'http.codes.401': 20 }, distributions: {}, short: true }))).toEqual([
      '20 of 20 responses not 2xx, 100.0% > 1% (401 ×20)',
    ]);
  });

  it('tolerates up to the rejected share under load', () => {
    const at = (rejected: number) =>
      evaluateChecks({}, { counters: { 'http.codes.200': 10_000 - rejected, 'http.codes.503': rejected }, distributions: {}, short: false });
    expect(failed(at(100))).toEqual([]);
    expect(failed(at(101))).toHaveLength(1);
    expect(
      failed(evaluateChecks({ maxRejectedShare: 5 }, { counters: { 'http.codes.200': 95, 'http.codes.500': 5 }, distributions: {}, short: false })),
    ).toEqual([]);
  });

  it('adds no response check to a run without responses', () => {
    expect(evaluateChecks({}, { counters: { 'vusers.created': 1 }, distributions: {}, short: false })).toEqual([]);
  });

  it('computes the VU error rate as ensure did: created minus completed, over created', () => {
    const counters = { 'vusers.created': 200, 'vusers.completed': 197, 'vusers.failed': 3 };
    expect(failed(evaluateChecks({ maxErrorRate: 1 }, { counters, distributions: {}, short: false }))).toEqual(['VU failures 1.5% > 1% (3 of 200)']);
    expect(failed(evaluateChecks({ maxErrorRate: 2 }, { counters, distributions: {}, short: false }))).toEqual([]);
  });

  it('compares thresholds with any recorded histogram, and skips them in a short run', () => {
    const checks = { thresholds: { 'http.response_time.p95': 500, 'yjs.peer_latency_ms.p99': 10 } };
    const distributions = { 'http.response_time': dist(400), 'yjs.peer_latency_ms': dist(20) };
    expect(failed(evaluateChecks(checks, { counters: {}, distributions, short: false }))).toEqual(['yjs.peer_latency_ms.p99 30ms > 10ms']);
    expect(evaluateChecks(checks, { counters: {}, distributions, short: true })).toEqual([]);
    expect(failed(evaluateChecks(checks, { counters: {}, distributions: {}, short: false }))).toEqual([
      'http.response_time.p95: nothing recorded',
      'yjs.peer_latency_ms.p99: nothing recorded',
    ]);
  });

  it('asks for expected counters in full runs only, for forbidden ones always', () => {
    const checks = { expect: ['sse.changes', 'sync.range_fetches'], forbid: ['sse.errors'] };
    const counters = { 'sync.range_fetches': 16, 'sse.errors': 3 };
    expect(failed(evaluateChecks(checks, { counters, distributions: {}, short: false }))).toEqual([
      'sse.changes stayed at 0',
      'sse.errors counted 3',
    ]);
    expect(failed(evaluateChecks(checks, { counters, distributions: {}, short: true }))).toEqual(['sse.errors counted 3']);
  });
});
