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
  it('ends as the deploy did: 0 deployed, 2 blocked (the runner and the apply read it so), anything else failed', () => {
    const { calls, run } = runs({});
    expect(mainJob(env, run)).toBe(0);
    expect(calls).toEqual([`deploy --mode staging --sha ${env.TARGET_SHA}`]);
    expect(mainJob(env, runs({ deploy: 2 }).run)).toBe(2);
    expect(mainJob(env, runs({ deploy: 1 }).run)).toBe(1);
    expect(mainJob(env, runs({ deploy: 137 }).run)).toBe(1);
  });

  it('must not start without a mode and a full commit id', () => {
    const { calls, run } = runs({});
    expect(mainJob({ MODE: 'staging', TARGET_SHA: 'main' }, run)).toBe(1);
    expect(mainJob({ TARGET_SHA: env.TARGET_SHA }, run)).toBe(1);
    expect(calls).toEqual([]);
  });
});
