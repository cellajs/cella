import { describe, expect, it } from 'vitest';
import type { RunRecord } from '../../lib/deploy/run-record';
import type { RunStore } from '../../lib/deploy/run-store';
import { showRuns } from './runs';

const record = (run: string, over: Partial<RunRecord> = {}): RunRecord => ({
  run,
  environment: 'staging',
  target: 'b'.repeat(40),
  startedAt: '2026-10-15T00:00:00.000Z',
  endedAt: '2026-10-15T00:06:00.000Z',
  outcome: 'deployed',
  steps: [{ title: 'Build the release', seconds: 125, outcome: 'ok' }],
  ...over,
});

const store = (records: RunRecord[], log = 'line 1\nline 2\n'): RunStore => ({
  listRuns: async (limit) => records.map((r) => r.run).slice(0, limit),
  readRecord: async (run) => records.find((r) => r.run === run),
  readLog: async () => log,
});

describe('Show runs', () => {
  it('lists the runs and shows the newest in full, with the end of its log, when nobody is at the prompt', async () => {
    const lines: string[] = [];
    const failed = record('20261015T010000Z-bbbbbbbbbb', {
      outcome: 'failed',
      failedStep: 'Waved rollout',
      error: 'cutover failed',
      steps: [{ title: 'Waved rollout', seconds: 30, outcome: 'error' }],
    });
    await showRuns(store([failed, record('20261015T000000Z-aaaaaaaaaa')]), { pick: false, print: (line) => lines.push(line) });
    expect(lines.filter((line) => line.startsWith('  2026-10-15'))).toHaveLength(2);
    const detail = lines.join('\n');
    expect(detail).toContain('failed at "Waved rollout"');
    expect(detail).toContain('cutover failed');
    expect(detail).toContain('line 2');
  });

  it('says so when no run has left a record', async () => {
    const lines: string[] = [];
    await showRuns(store([]), { pick: false, print: (line) => lines.push(line) });
    expect(lines).toEqual(['No run has left a record yet.']);
  });
});
