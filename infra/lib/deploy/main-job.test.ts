import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { declaredMainJob, MAIN_JOB_ENV_NAMES, MAIN_JOB_EXIT, MAIN_JOB_SCRIPT, mainJobOutcome, storeDeployKeyCopy } from './main-job';

const DIGEST = `sha256:${'1'.repeat(64)}`;

describe('the main job', () => {
  it('runs a script sh accepts', () => {
    const check = spawnSync('sh', ['-n'], { input: MAIN_JOB_SCRIPT, encoding: 'utf8' });
    expect(check.stderr).toBe('');
    expect(check.status).toBe(0);
  });

  it("hands the engine the names it lists alone: a start call's NODE_OPTIONS, GIT_CONFIG_* or RELEASES_ONLY never reach it", () => {
    // The script as it runs, with env printing what the engine would start with: no /engine here, and env takes pnpm's place.
    const script = MAIN_JOB_SCRIPT.replace('cd /engine || exit 1', 'true').replace(' pnpm --silent --filter infra main-job', ' /usr/bin/env');
    const started = spawnSync('sh', ['-c', script], {
      encoding: 'utf8',
      env: {
        TARGET_SHA: 'a'.repeat(40),
        RETRY: '0',
        DEPLOY_KEY_JSON: '{}',
        SCW_DEFAULT_PROJECT_ID: 'p',
        SCW_DEFAULT_ORGANIZATION_ID: 'o',
        NODE_OPTIONS: '--import=data:text/javascript,process.exit(0)',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'url.https://mallory.example/app.git.insteadOf',
        GIT_CONFIG_VALUE_0: 'https://github.com/example/app.git',
        RELEASES_ONLY: '0',
        MODE: 'staging',
        LD_PRELOAD: '/tmp/x.so',
      },
    });
    expect(started.status).toBe(0);
    const names = started.stdout
      .trim()
      .split('\n')
      .map((line) => line.slice(0, line.indexOf('=')));
    expect(names.sort()).toEqual(['HOME', 'PATH', ...MAIN_JOB_ENV_NAMES].sort());
  });

  it('names the engine image by its digest, never by a tag, which can move to another image', () => {
    const image = `rg.nl-ams.scw.cloud/app/infra-engine@${DIGEST}`;
    expect(declaredMainJob({ projectId: 'p', organizationId: 'o', image }).imageUri).toBe(image);
    expect(() => declaredMainJob({ projectId: 'p', organizationId: 'o', image: 'rg.nl-ams.scw.cloud/app/infra-engine:0.34.0' })).toThrow(/digest/);
    expect(() => declaredMainJob({ projectId: 'p', organizationId: 'o', image: `rg.nl-ams.scw.cloud/app/infra-engine:${DIGEST}` })).toThrow(/digest/);
  });

  it('reads a succeeded run as deployed: Scaleway reports a run that exited 0 with no exit code (staging, 2026-10-20)', () => {
    expect(mainJobOutcome({ state: 'succeeded', exit_code: null })).toBe('deployed');
  });

  it('tells blocked from failed by the exit code of a failed run, and reads every other end as failed', () => {
    expect(mainJobOutcome({ state: 'failed', exit_code: MAIN_JOB_EXIT.blocked })).toBe('blocked');
    expect(mainJobOutcome({ state: 'failed', exit_code: MAIN_JOB_EXIT.failed })).toBe('failed');
    expect(mainJobOutcome({ state: 'failed', exit_code: 137 })).toBe('failed');
    expect(mainJobOutcome({ state: 'interrupted', exit_code: null })).toBe('failed');
  });

  it('copies the deploy key to the engine folder, both halves only, and disables the earlier copy', async () => {
    const calls: unknown[] = [];
    await storeDeployKeyCopy(
      {
        ensureSecret: async (input) => {
          calls.push(input);
          return { id: 'secret-1' };
        },
        putSecretValue: async (input) => {
          calls.push(input);
        },
      },
      { accessKey: 'SCWDEPLOY', secretKey: 'deploy-secret', organizationId: 'org' } as never,
    );
    expect(calls[0]).toMatchObject({ name: 'deploy-key', path: '/engine' });
    expect(calls[1]).toMatchObject({ secretId: 'secret-1', disablePrevious: true });
    expect(JSON.parse((calls[1] as { value: string }).value)).toEqual({ accessKey: 'SCWDEPLOY', secretKey: 'deploy-secret' });
  });
});
