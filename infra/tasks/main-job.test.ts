import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mainJob } from './main-job';

const env = { MODE: 'staging', TARGET_SHA: 'a'.repeat(40), RETRY: '1' };

function runs(codes: Record<string, number>) {
  const calls: string[] = [];
  return {
    calls,
    run: (script: string, args: string[]) => {
      calls.push(`${script} ${args.join(' ')}`);
      return codes[script] ?? 0;
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('a main job run', () => {
  it('deploys the target, then reaps the generation it displaced', () => {
    const { calls, run } = runs({});
    expect(mainJob(env, run)).toBe(0);
    expect(calls).toEqual([`deploy --mode staging --sha ${env.TARGET_SHA} --defer-reap`, `reap --mode staging --sha ${env.TARGET_SHA}`]);
  });

  it('ends blocked when the deploy stopped on an owed privileged change, and reaps nothing', () => {
    const { calls, run } = runs({ deploy: 2 });
    expect(mainJob(env, run)).toBe(2);
    expect(calls).toHaveLength(1);
  });

  it('ends failed on any other failure of the deploy, and on a failed reap', () => {
    expect(mainJob(env, runs({ deploy: 1 }).run)).toBe(1);
    expect(mainJob(env, runs({ deploy: 137 }).run)).toBe(1);
    expect(mainJob(env, runs({ reap: 1 }).run)).toBe(1);
  });

  it('must not start without a mode and a full commit id', () => {
    const { calls, run } = runs({});
    expect(mainJob({ MODE: 'staging', TARGET_SHA: 'main' }, run)).toBe(1);
    expect(mainJob({ TARGET_SHA: env.TARGET_SHA }, run)).toBe(1);
    expect(calls).toEqual([]);
  });
});
