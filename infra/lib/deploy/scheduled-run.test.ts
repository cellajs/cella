import { describe, expect, it } from 'vitest';
import type { RunRecord } from './run-record';
import { decideScheduledRun, type ScheduledEffects, scheduledVerdict } from './scheduled-run';

const sha = (digit: string) => digit.repeat(40);
const record = (target: string, outcome: RunRecord['outcome'], retry?: number): RunRecord => ({
  run: `20261106T120000Z-${target.slice(0, 10)}`,
  environment: 'staging',
  target,
  ...(retry === undefined ? {} : { retry }),
  startedAt: '2026-11-06T12:00:00.000Z',
  outcome,
  steps: [],
});

describe('a scheduled run', () => {
  it('deploys a target and retry counter once, and never again by itself, however that run ended', () => {
    const target = { sha: sha('b'), retry: 0 };
    expect(decideScheduledRun(target, [])).toEqual({ action: 'deploy' });
    for (const outcome of ['running', 'deployed', 'unchanged', 'failed', 'blocked', 'apply needed'] as const) {
      const ran = record(sha('b'), outcome, 0);
      expect(decideScheduledRun(target, [ran])).toEqual({ action: 'none', record: ran });
    }
    // A record from before records kept the counter reads as 0.
    expect(decideScheduledRun(target, [record(sha('b'), 'failed')]).action).toBe('none');
  });

  it('deploys a raised retry counter or another target, whatever ran before', () => {
    expect(decideScheduledRun({ sha: sha('b'), retry: 1 }, [record(sha('b'), 'failed', 0)])).toEqual({ action: 'deploy' });
    expect(decideScheduledRun({ sha: sha('b'), retry: 0 }, [record(sha('a'), 'deployed', 0)])).toEqual({ action: 'deploy' });
  });
});

describe("a scheduled run's lease and record", () => {
  const sha = 'c'.repeat(40);
  const started = new Date('2026-11-06T12:00:00Z');
  const looking = 'run:20261106T120000Z';
  const deploying = `run:20261106T120000Z-${sha.slice(0, 10)}`;
  const fake = (opts: { held?: boolean; records?: RunRecord[]; writeFails?: boolean }) => {
    const calls: string[] = [];
    const fx: ScheduledEffects = {
      takeLease: async (owner, operation) => {
        calls.push(`take ${owner} ${operation}`);
        return opts.held ? { owner: 'run:20261106T115900Z-aaaaaaaaaa', operation: 'deploy', acquiredAt: '', expiresAt: '' } : undefined;
      },
      handOverLease: async (from, to, operation) => {
        calls.push(`hand ${from} to ${to} ${operation}`);
        return true;
      },
      releaseLease: async (owner) => {
        calls.push(`release ${owner}`);
      },
      environmentsFile: async () => {
        calls.push('read');
        return '';
      },
      listRemote: async () => [{ sha, ref: 'refs/tags/1.0.0' }],
      records: async () => opts.records ?? [],
      writeRecord: async (record) => {
        calls.push(`write ${record.run} ${record.outcome}`);
        if (opts.writeFails) throw new Error('bucket refused');
      },
    };
    return { fx, calls };
  };

  // The deploy takes over the lease its scheduled run handed it (tasks/deploy-run.ts, adopt), and the status reads a running record by it.
  it.each([
    { case: 'a held lease ends at once, reads nothing and releases nothing', opts: { held: true }, calls: [`take ${looking} scheduled run`] },
    {
      case: 'a deploy hands the lease to its run, then opens the record, and keeps the lease',
      opts: {},
      calls: [`take ${looking} scheduled run`, 'read', `hand ${looking} to ${deploying} deploy`, `write ${deploying.slice(4)} running`],
    },
    {
      case: 'a record write that fails releases the lease under the deploy owner and deploys nothing',
      opts: { writeFails: true },
      calls: [
        `take ${looking} scheduled run`,
        'read',
        `hand ${looking} to ${deploying} deploy`,
        `write ${deploying.slice(4)} running`,
        `release ${deploying}`,
      ],
    },
    {
      case: 'a run that starts nothing releases its looking lease',
      opts: { records: [record(sha, 'deployed', 0)] },
      calls: [`take ${looking} scheduled run`, 'read', `release ${looking}`],
    },
  ])('$case', async ({ opts, calls: expected }) => {
    const { fx, calls } = fake(opts);
    const verdict = scheduledVerdict('production', fx, started);
    if (opts.writeFails) await expect(verdict).rejects.toThrow('bucket refused');
    else await verdict;
    expect(calls).toEqual(expected);
  });
});
