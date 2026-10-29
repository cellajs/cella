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
  readBootAccount: async (key) =>
    key === 'backend-20261015T010300Z-boot.log' ? 'service=backend\nboot_rc=1\n\n--- boot error ---\nmigrate exited 1\n\nlast boot line' : undefined,
});

describe('Show runs', () => {
  it('must not let a record that says deployed hide a job run that failed: a cut-short or rewritten record is flagged', async () => {
    const lines: string[] = [];
    const jobRuns = [
      {
        id: 'r1',
        state: 'failed',
        exit_code: 1,
        created_at: '2026-10-14T23:59:00Z',
        terminated_at: '2026-10-15T00:07:00Z',
        environment_variables: { TARGET_SHA: 'b'.repeat(40) },
      },
    ];
    await showRuns(store([record('20261015T000000Z-bbbbbbbbbb')]), {
      pick: false,
      print: (line) => lines.push(line),
      jobRuns,
      environment: 'staging',
    });
    expect(lines[0]).toContain('deployed');
    expect(lines[0]).toContain('the job run ended failed');
  });

  it('lists every run, one that left no record too (D27), and shows the newest in full with a failed machine’s boot error and the end of its log', async () => {
    const lines: string[] = [];
    const failed = record('20261015T010000Z-bbbbbbbbbb', {
      startedAt: '2026-10-15T01:00:00.000Z',
      outcome: 'failed',
      failedStep: 'Waved rollout',
      error: 'cutover failed',
      steps: [{ title: 'Waved rollout', seconds: 30, outcome: 'error' }],
      boot: [{ service: 'backend', key: 'backend-20261015T010300Z-boot.log', failed: true }, { service: 'cdc' }],
    });
    const jobRuns = [
      { id: 'r3', state: 'failed', exit_code: 1, created_at: '2026-10-15T02:00:00Z', environment_variables: { TARGET_SHA: 'c'.repeat(40) } },
      {
        id: 'r2',
        state: 'failed',
        exit_code: 1,
        created_at: '2026-10-15T00:59:00Z',
        terminated_at: '2026-10-15T01:05:00Z',
        environment_variables: { TARGET_SHA: 'b'.repeat(40) },
      },
    ];
    await showRuns(store([failed, record('20261015T000000Z-aaaaaaaaaa')]), {
      pick: false,
      print: (line) => lines.push(line),
      jobRuns,
      environment: 'staging',
    });
    expect(lines.filter((line) => line.startsWith('  2026-10-15'))).toHaveLength(3);
    expect(lines[0]).toBe('  2026-10-15 02:00  staging  cccccccccc  failed (exit 1), no record');
    const detail = lines.join('\n');
    expect(detail).toContain('failed at "Waved rollout"');
    expect(detail).toContain('migrate exited 1');
    expect(detail).toContain('cdc: no account of this release');
    expect(detail).toContain('line 2');
  });

  it('flags a run started with a repository of its own (D-b): the start call can set any value, and the job cannot refuse it', async () => {
    const lines: string[] = [];
    const definition = { command: 'bash\n-c\nscript', env: { MODE: 'production', REPO: 'https://github.com/example/app.git', RELEASES_ONLY: '1' } };
    const run = (id: string, values: Record<string, string>, created_at: string) => ({
      id,
      state: 'running',
      created_at,
      startup_command: ['bash', '-c', 'script'],
      args: [],
      environment_variables: { ...definition.env, TARGET_SHA: 'c'.repeat(40), RETRY: '0', ...values },
    });
    await showRuns(store([]), {
      pick: false,
      print: (line) => lines.push(line),
      jobRuns: [run('r2', { REPO: 'https://github.com/mallory/app.git' }, '2026-10-15T02:00:00Z'), run('r1', {}, '2026-10-15T01:00:00Z')],
      definition,
      environment: 'production',
    });
    expect(lines[0]).toContain('started with its own values: sets REPO to another value');
    expect(lines[1]).not.toContain('its own values');
  });

  it('says so when no run has left a record', async () => {
    const lines: string[] = [];
    await showRuns(store([]), { pick: false, print: (line) => lines.push(line) });
    expect(lines).toEqual(['No run has left a record yet.']);
  });
});
