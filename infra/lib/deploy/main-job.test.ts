import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { MAIN_JOB_EXIT, MAIN_JOB_SCRIPT, mainJobOutcome, storeDeployKeyCopy } from './main-job';

describe('the main job', () => {
  it('runs a script bash accepts', () => {
    const check = spawnSync('bash', ['-n'], { input: MAIN_JOB_SCRIPT, encoding: 'utf8' });
    expect(check.stderr).toBe('');
    expect(check.status).toBe(0);
  });

  it('must not echo a key, and drops the deploy key and the repository key from its environment once read', () => {
    const lines = MAIN_JOB_SCRIPT.split('\n');
    expect(lines.filter((line) => line.startsWith('echo')).every((line) => !/KEY|PASSPHRASE/.test(line))).toBe(true);
    expect(lines).toContain('unset DEPLOY_KEY_JSON');
    expect(lines).toContain('unset REPO_KEY');
    expect(lines.at(-2)).toBe('exec pnpm --silent --filter infra main-job');
  });

  it('reads deployed, blocked and failed from a run exit code', () => {
    expect(mainJobOutcome(MAIN_JOB_EXIT.deployed)).toBe('deployed');
    expect(mainJobOutcome(MAIN_JOB_EXIT.blocked)).toBe('blocked');
    expect(mainJobOutcome(MAIN_JOB_EXIT.failed)).toBe('failed');
    expect(mainJobOutcome(137)).toBe('failed');
    expect(mainJobOutcome(undefined)).toBe('failed');
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
      { slug: 'cella-staging', mode: 'staging', key: { accessKey: 'SCWDEPLOY', secretKey: 'deploy-secret', organizationId: 'org' } as never },
    );
    expect(calls[0]).toMatchObject({ name: 'deploy-key', path: '/cella-staging-staging/engine' });
    expect(calls[1]).toMatchObject({ secretId: 'secret-1', disablePrevious: true });
    expect(JSON.parse((calls[1] as { value: string }).value)).toEqual({ accessKey: 'SCWDEPLOY', secretKey: 'deploy-secret' });
  });
});
