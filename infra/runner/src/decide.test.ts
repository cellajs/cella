import { describe, expect, it } from 'vitest';
import type { JobRun } from '../../lib/deploy/job-runs';
import { decide } from './decide';

const sha = (digit: string) => digit.repeat(40);
const run = (id: string, state: string, target: string, retry?: string, exit_code?: number): JobRun => ({
  id,
  state,
  exit_code,
  environment_variables: { MODE: 'staging', TARGET_SHA: target, ...(retry === undefined ? {} : { RETRY: retry }) },
});

describe('the runner', () => {
  it('starts a target and retry counter once, never beside a run in progress, and never again by itself (C17, D21)', () => {
    const target = { sha: sha('b'), retry: 0 };
    expect(decide(target, [run('r1', 'succeeded', sha('a'), '0')])).toEqual({ action: 'start' });
    expect(decide(target, [run('r2', 'running', sha('a'), '0'), run('r1', 'succeeded', sha('a'), '0')]).action).toBe('wait');
    for (const ended of [run('r2', 'succeeded', sha('b')), run('r2', 'failed', sha('b'), '0', 1), run('r2', 'failed', sha('b'), '0', 2)]) {
      expect(decide(target, [ended])).toEqual({ action: 'none', run: ended });
    }
    expect(decide({ ...target, retry: 1 }, [run('r2', 'failed', sha('b'), '0', 1)])).toEqual({ action: 'start' });
  });
});
