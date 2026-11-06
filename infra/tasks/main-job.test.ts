import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineStamp } from '../lib/deploy/applied-engine';
import type { RemoteRef } from '../lib/deploy/target';
import { type MainJobEffects, mainJob } from './main-job';

const KEY = JSON.stringify({ accessKey: 'SCWDEPLOY', secretKey: 'deploy-secret' });
const env = { TARGET_SHA: 'a'.repeat(40), RETRY: '1', DEPLOY_KEY_JSON: KEY, SCW_DEFAULT_PROJECT_ID: 'p' };
const stamp = (mode: string): EngineStamp => ({ mode, descriptionHash: 'd'.repeat(64) });

/** A lightweight release, an annotated one (its tag object and its peeled commit) and a tag that is no release. */
const REFS: RemoteRef[] = [
  { sha: '1'.repeat(40), ref: 'refs/tags/0.25.0' },
  { sha: '2'.repeat(40), ref: 'refs/tags/0.26.0' },
  { sha: '3'.repeat(40), ref: 'refs/tags/0.26.0^{}' },
  { sha: '4'.repeat(40), ref: 'refs/tags/nightly' },
];

function effects(opts: { stamp?: EngineStamp; codes?: Record<string, number>; refs?: RemoteRef[] | Error } = {}) {
  const calls: Array<{ line: string; env: NodeJS.ProcessEnv }> = [];
  const listed: string[] = [];
  const fx: MainJobEffects = {
    stamp: () => opts.stamp,
    releaseRefs: async ({ mode }) => {
      listed.push(mode);
      if (opts.refs instanceof Error) throw opts.refs;
      return opts.refs ?? REFS;
    },
    scheduledEffects: async () => {
      throw new Error('a run started by hand reads no schedule');
    },
    run: (script, args, runEnv) => {
      calls.push({ line: `${script} ${args.join(' ')}`, env: runEnv });
      return opts.codes?.[script] ?? 0;
    },
  };
  return { fx, calls, listed };
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('a main job run', () => {
  it('deploys to the environment its engine image was built for, with the deploy key in SCW_* and no copy of it left', async () => {
    const { fx, calls } = effects({ stamp: stamp('staging') });
    expect(await mainJob(env, fx)).toBe(0);
    expect(calls.map((call) => call.line)).toEqual([`deploy --mode staging --sha ${env.TARGET_SHA} --retry 1`]);
    expect(calls[0]?.env).toMatchObject({ SCW_ACCESS_KEY: 'SCWDEPLOY', SCW_SECRET_KEY: 'deploy-secret' });
    expect(calls[0]?.env).not.toHaveProperty('DEPLOY_KEY_JSON');
  });

  it('ends as the deploy did: 0 deployed, 2 blocked (the apply and Show runs read it so), anything else failed', async () => {
    for (const [code, ended] of [
      [2, 2],
      [1, 1],
      [137, 1],
    ] as const) {
      expect(await mainJob(env, effects({ stamp: stamp('staging'), codes: { deploy: code } }).fx)).toBe(ended);
    }
  });

  it('must not start without a full commit id or the deploy key', async () => {
    const { fx, calls } = effects({ stamp: stamp('staging') });
    expect(await mainJob({ ...env, TARGET_SHA: 'main' }, fx)).toBe(1);
    expect(await mainJob({ ...env, DEPLOY_KEY_JSON: '{}' }, fx)).toBe(1);
    expect(await mainJob({ ...env, DEPLOY_KEY_JSON: '{"accessKey":{},"secretKey":[1]}' }, fx)).toBe(1);
    expect(calls).toEqual([]);
  });

  it("must not deploy a commit no release names where the image's environment deploys releases only, whatever values the start set (D-f)", async () => {
    // A start call may set any value: none of these turns the check off or moves the run to an environment without it.
    const own = { ...env, RELEASES_ONLY: '0', MODE: 'staging', REPO: 'https://github.com/mallory/app.git' };
    for (const sha of ['a'.repeat(40), '2'.repeat(40), '4'.repeat(40)]) {
      const { fx, calls, listed } = effects({ stamp: stamp('production') });
      expect(await mainJob({ ...own, TARGET_SHA: sha }, fx)).toBe(1);
      expect(listed).toEqual(['production']);
      expect(calls).toEqual([]);
    }
    for (const sha of ['1'.repeat(40), '3'.repeat(40)]) {
      const { fx, calls } = effects({ stamp: stamp('production') });
      expect(await mainJob({ ...own, TARGET_SHA: sha }, fx)).toBe(0);
      expect(calls.map((call) => call.line)).toEqual([`deploy --mode production --sha ${sha} --retry 1`]);
    }
  });

  it('fails a release check that cannot list the tags, as a private repository without its read key answers', async () => {
    const { fx, calls } = effects({ stamp: stamp('production'), refs: new Error('git ls-remote failed: Authentication failed') });
    expect(await mainJob({ ...env, TARGET_SHA: '1'.repeat(40) }, fx)).toBe(1);
    expect(calls).toEqual([]);
  });
});
