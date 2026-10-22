import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type BaselineEntry, baselineFile, compareBaseline, loadBaseline, RUNNER_EPOCH, saveBaseline } from '../runner/baseline';

const entry = (overrides: Partial<BaselineEntry> = {}): BaselineEntry => ({
  runner: RUNNER_EPOCH,
  timestamp: '2026-10-20T10:00:00.000Z',
  scenario: 'get-me',
  requests: 40_000,
  requestRate: 1600,
  mean: 3,
  p50: 2,
  p95: 6,
  p99: 9,
  errors: 0,
  vusersCreated: 2000,
  vusersFailed: 0,
  primary: { metric: 'http.response_time.p95', value: 6 },
  endpoints: {},
  ...overrides,
});

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-baseline-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('baselines', () => {
  it('compares only with entries of this runner epoch', () => {
    const dir = tempDir();
    const legacy = join(dir, 'legacy.json');
    writeFileSync(legacy, JSON.stringify([{ timestamp: '2026-10-09T00:00:00.000Z', scenario: 'get-me', requests: 40_000, p95: 7 }]));

    expect(saveBaseline(dir, entry(), legacy)).toBe(2);
    const history = JSON.parse(readFileSync(baselineFile(dir, 'get-me'), 'utf8')) as { runner?: string }[];
    expect(history.map((run) => run.runner)).toEqual([undefined, RUNNER_EPOCH]);
    expect(loadBaseline(dir, 'get-me')).toEqual({ baseline: entry(), older: 1 });
  });

  it('reports no baseline while only older-runner entries exist', () => {
    const dir = tempDir();
    const legacy = join(dir, 'legacy.json');
    writeFileSync(legacy, JSON.stringify([{ scenario: 'get-me', p95: 7 }]));
    saveBaseline(dir, { ...entry(), runner: 'artillery' as typeof RUNNER_EPOCH }, legacy);
    expect(loadBaseline(dir, 'get-me')).toEqual({ baseline: null, older: 2 });
    expect(loadBaseline(dir, 'page-load')).toEqual({ baseline: null, older: 0 });
  });

  it('lists the primary latency first, then the HTTP percentiles and the rate', () => {
    const now = entry({ primary: { metric: 'sync.fetch_ms.p95', value: 30 }, p50: 2, p95: 12, p99: 9, requestRate: 1600 });
    const before = entry({ primary: { metric: 'sync.fetch_ms.p95', value: 40 }, p50: 2, p95: 6, p99: 0, requestRate: 800 });
    expect(compareBaseline(now, before).map(({ label, pct }) => [label, pct])).toEqual([
      ['sync.fetch_ms.p95', -25],
      ['p50', 0],
      ['p95', 100],
      ['p99', null],
      ['req/s', 100],
    ]);
  });
});
