import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAIN_JOB_EXIT, MAIN_JOB_SCRIPT, mainJobOutcome, RELEASE_CHECK, storeDeployKeyCopy } from './main-job';

/** Run the release check in bash, against a `git` on PATH whose `ls-remote` lists a lightweight and an annotated release tag. */
function releaseCheck(targetSha: string) {
  const bin = mkdtempSync(join(tmpdir(), 'release-check-'));
  const refs = [
    `${'1'.repeat(40)}\trefs/tags/0.25.0`,
    `${'2'.repeat(40)}\trefs/tags/0.26.0`,
    `${'3'.repeat(40)}\trefs/tags/0.26.0^{}`,
    `${'4'.repeat(40)}\trefs/tags/nightly`,
  ];
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' ${refs.map((ref) => `'${ref}'`).join(' ')}\n`);
  chmodSync(join(bin, 'git'), 0o755);
  const script = `set -euo pipefail\ngit_read() { git "$@"; }\n${RELEASE_CHECK}\necho checked`;
  return spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RELEASES_ONLY: '1', MODE: 'production', TARGET_SHA: targetSha },
  });
}

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

  it('ends a run that fails before the deploy task as failed: a tool exiting 2, as tar does, must not read as blocked', () => {
    const lines = MAIN_JOB_SCRIPT.split('\n');
    const prologue = lines.slice(0, lines.findIndex((line) => line.startsWith('trap ')) + 1).join('\n');
    const run = spawnSync('bash', ['-c', `${prologue}\nsh -c 'exit 2'\necho unreachable`], { encoding: 'utf8' });
    expect(run.status).toBe(MAIN_JOB_EXIT.failed);
    expect(run.stdout).not.toContain('unreachable');
    expect(run.stderr).toContain('the run stopped before the deploy (exit 2)');
  });

  it("installs the Pulumi CLI from its release archive without restoring owners, which a job's root may not, and pipes no script into a shell", () => {
    expect(MAIN_JOB_SCRIPT).toContain('tar -xz --no-same-owner');
    expect(MAIN_JOB_SCRIPT).not.toMatch(/\|\s*(ba)?sh\b/);
  });

  it('must not fetch a commit no release names where the environment deploys releases only (D-f): a hand-started run is refused', () => {
    const refused = releaseCheck('a'.repeat(40));
    expect(refused.status).toBe(MAIN_JOB_EXIT.failed);
    expect(refused.stderr).toContain(`production deploys releases only: ${'a'.repeat(40)} is no release`);
    expect(refused.stdout).not.toContain('checked');
    // An annotated tag names its commit on the peeled line; the tag object itself is no release commit.
    expect(releaseCheck('2'.repeat(40)).status).toBe(MAIN_JOB_EXIT.failed);
    expect(releaseCheck('4'.repeat(40)).status).toBe(MAIN_JOB_EXIT.failed);
    for (const release of ['1'.repeat(40), '3'.repeat(40)]) {
      const passed = releaseCheck(release);
      expect(passed.status).toBe(0);
      expect(passed.stdout).toContain('checked');
    }
  });

  it('reads a succeeded run as deployed: Scaleway reports a run that exited 0 with no exit code (staging, 2026-10-20)', () => {
    expect(mainJobOutcome({ state: 'succeeded', exit_code: null })).toBe('deployed');
  });

  it('tells blocked from failed by the exit code of a failed run, and reads every other end as failed', () => {
    expect(mainJobOutcome({ state: 'failed', exit_code: MAIN_JOB_EXIT.blocked })).toBe('blocked');
    expect(mainJobOutcome({ state: 'failed', exit_code: MAIN_JOB_EXIT.failed })).toBe('failed');
    expect(mainJobOutcome({ state: 'failed', exit_code: 137 })).toBe('failed');
    expect(mainJobOutcome({ state: 'canceled', exit_code: null })).toBe('failed');
    expect(mainJobOutcome({ state: 'internal_error' })).toBe('failed');
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
