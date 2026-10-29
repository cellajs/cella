import { describe, expect, it } from 'vitest';
import type { RunRecord } from '../lib/deploy/run-record';
import { ExitCodeError } from '../lib/utils/errors';
import type { AllowedKey } from './deploy-env';
import { type DeployEffects, type DeployOptions, deployFailureHint, parseDeployArgs, runDeploy } from './deploy-run';

/** Cella-shaped deploy env table, injected in place of the shared config load. */
async function fakeDeployEnv(opts: DeployOptions): Promise<Record<AllowedKey, string>> {
  return {
    environment: opts.mode,
    image_tag: opts.sha,
    pulumi_stack: opts.mode,
    region: 'fr-par',
    registry_ns: 'cella-registry',
    public_bucket: '',
    frontend_bucket: 'cella-frontend',
    state_bucket: 'cella-pulumi-state',
    diag_bucket: 'cella-boot-diag',
    enabled_services_json: JSON.stringify([
      // health_url mirrors deploy-env: set for LB-exposed services
      // (including co-hosted followers), '' for internal-only ones. The
      // version-verification step reads THESE rows, not the rollout matrices.
      { service: 'backend', public_url: 'https://www.cellajs.com/api', health_url: 'https://www.cellajs.com/api' },
      { service: 'cdc', public_url: '', health_url: '' },
      { service: 'yjs', public_url: 'https://www.cellajs.com/yjs', health_url: 'https://www.cellajs.com/yjs' },
      { service: 'frontend', public_url: 'https://www.cellajs.com', health_url: 'https://www.cellajs.com' },
    ]),
    build_images_matrix: JSON.stringify([{ service: 'backend', dockerfile: 'Dockerfile', target: 'backend' }]),
    primary_rollout_matrix: JSON.stringify([{ service: 'backend', health_url: 'https://www.cellajs.com/api' }]),
    roll_rest_matrix: JSON.stringify([
      { service: 'cdc', health_url: '' },
      { service: 'frontend', health_url: 'https://www.cellajs.com' },
    ]),
  };
}

function makeFake(opts: { rolloutFails?: boolean; verifyFails?: boolean; updateFails?: boolean; leaseLost?: boolean } = {}) {
  const ops: string[] = [];
  const rolloutArgs: string[][] = [];
  const taskArgs: Record<string, string[]> = {};
  const execCalls: Array<{ cmd: string; args: string[]; opts: Parameters<DeployEffects['exec']>[2] }> = [];
  const records: Array<{ bucket: string; record: RunRecord; log: string }> = [];
  const fx: DeployEffects = {
    initTelemetry: async () => {
      ops.push('telemetry:init');
    },
    task: async (name, argv = []) => {
      ops.push(`task:${name}${argv[0] && !argv[0].startsWith('--') ? `:${argv[0]}` : ''}`);
      taskArgs[name] = [...argv];
    },
    lease: async (_stack, operation) => {
      ops.push(`lease:acquire:${operation}`);
      return {
        release: async () => {
          ops.push('lease:release');
        },
        lost: opts.leaseLost === true,
      };
    },
    exec: async (cmd, args, execOpts) => {
      ops.push(`exec:${cmd}:${args[0]}${execOpts?.allowFailure ? ':allow-failure' : ''}`);
      execCalls.push({ cmd, args: [...args], opts: execOpts });
    },
    update: async (stack) => {
      ops.push(`update:${stack}`);
      if (opts.updateFails) throw new Error('stack update failed');
    },
    rollout: async (argv) => {
      ops.push('rollout');
      rolloutArgs.push([...argv]);
      if (opts.rolloutFails) throw new Error('cutover failed');
    },
    verifyVersion: async (url) => {
      ops.push(`verify:${url}`);
      return !opts.verifyFails;
    },
    publishEntryFiles: async () => {
      ops.push('publish-entry');
    },
    bootAccounts: async ({ sha }) => {
      ops.push(`boot-diag:${sha}`);
      return [{ service: 'backend', key: 'backend-20261025T200000Z-boot.log', failed: true }, { service: 'cdc' }];
    },
    writeRunRecord: async ({ bucket, record, log }) => {
      ops.push('record');
      records.push({ bucket, record, log });
    },
    group: () => {},
    groupEnd: () => {},
    info: () => {},
  };
  return { fx, ops, rolloutArgs, taskArgs, execCalls, records };
}

const baseOpts = { mode: 'production', sha: 'abc123' };

describe('parseDeployArgs', () => {
  it('parses flags and refuses non-pinned tags', () => {
    expect(parseDeployArgs(['--mode', 'staging', '--sha', 'abc'])).toEqual({
      mode: 'staging',
      sha: 'abc',
      run: undefined,
    });
    expect(() => parseDeployArgs(['--mode', 'staging', '--sha', 'latest'])).toThrow(/non-pinned/);
    expect(() => parseDeployArgs(['--mode', 'staging'])).toThrow(/Usage/);
  });
});

describe('runDeploy sequencing', () => {
  it('refreshes GeoIP data before the stack update when a public bucket exists, and shrugs off a failure', async () => {
    const withBucket = async (o: DeployOptions) => ({ ...(await fakeDeployEnv(o)), public_bucket: 'cella-public' });

    const ok = makeFake();
    await runDeploy(baseOpts, ok.fx, withBucket);
    expect(ok.ops.indexOf('task:geoip-refresh')).toBeGreaterThan(ok.ops.indexOf('task:build-release'));
    expect(ok.ops.indexOf('task:geoip-refresh')).toBeLessThan(ok.ops.indexOf('task:generation-keys'));

    const failing = makeFake();
    const task = failing.fx.task;
    failing.fx.task = async (name, argv) => {
      if (name === 'geoip-refresh') throw new Error('db-ip down');
      return task(name, argv);
    };
    await runDeploy(baseOpts, failing.fx, withBucket);
    expect(failing.ops).toContain('rollout');

    const none = makeFake();
    await runDeploy(baseOpts, none.fx, fakeDeployEnv);
    expect(none.ops).not.toContain('task:geoip-refresh');
  });

  it('runs preflights, rollout, verification, entry publish, smoke, then releases the lock', async () => {
    const { fx, ops } = makeFake();
    await runDeploy(baseOpts, fx, fakeDeployEnv);

    // Ordering spine: identities checked first, lock before any stack mutation,
    // machine keys read before the stack update writes them into cloud-init,
    // rollout after preflights, publish only after verification, lock release last.
    const spine = [
      'task:identity-plan',
      'task:ensure-state-bucket',
      'exec:pulumi:login',
      'lease:acquire:deploy',
      // Leftover pointers are reconciled before anything plans the stack.
      'task:sync-rollout-config',
      'task:preflight-privileged',
      // A missing secret blocks the run before any machine exists, the builder included.
      'task:assert-secrets-deliverable',
      'task:build-release',
      'task:generation-keys',
      'update:production',
      'rollout',
      'publish-entry',
      'task:smoke',
      // The displaced generations are reaped once smoke passed, under the same lock.
      'update:production',
      'lease:release',
    ];
    let cursor = -1;
    for (const op of spine) {
      const index = ops.indexOf(op, cursor + 1);
      expect(index, `${op} missing or out of order in: ${ops.join(', ')}`).toBeGreaterThan(cursor);
      cursor = index;
    }
    // Public version verification covers every LB-exposed service, including
    // the co-hosted follower (yjs), which is absent from the rollout matrices.
    expect(ops.some((op) => op.startsWith('verify:') && op.endsWith('/health'))).toBe(true);
    expect(ops).toContain('verify:https://www.cellajs.com/yjs/health');
    expect(ops.some((op) => op.startsWith('boot-diag'))).toBe(false);
  });

  it("only checks the state bucket: making and hardening it is the setup's, on the operator key", async () => {
    const { fx, taskArgs } = makeFake();
    await runDeploy(baseOpts, fx, fakeDeployEnv);
    expect(taskArgs['ensure-state-bucket']).toEqual(['--check']);
  });

  it('reconciles pointers against the services the rollout cuts over', async () => {
    const { fx, taskArgs } = makeFake();
    await runDeploy(baseOpts, fx, fakeDeployEnv);
    // The rollout matrices' rows: yjs runs on the host, so its pointers are dropped.
    expect(taskArgs['sync-rollout-config']).toEqual(['--stack', 'production', '--reset-pending', '--deployed', 'backend,cdc,frontend']);
  });

  it('stops before the stack update when the preflight finds a pending privileged change', async () => {
    const { main: preflight } = await import('./preflight-privileged');
    const { fx, ops } = makeFake();
    const task = fx.task;
    // The real preflight task, reading a preview that holds a privileged change.
    fx.task = async (name, argv = []) => {
      if (name !== 'preflight-privileged') return task(name, argv);
      ops.push(`task:${name}`);
      await preflight(argv, {
        stackIsSetUp: () => true,
        preview: async () => [
          {
            op: 'update',
            urn: 'urn:pulumi:production::infra::scaleway:iam/policy:Policy::vm-backend-policy',
            detailedDiff: { 'rules[0].condition': { kind: 'update' } },
          },
        ],
      });
    };
    const exitCodeBefore = process.exitCode;

    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/privileged change\(s\) pending/);
    expect(ops).toContain('task:preflight-privileged');
    expect(ops).not.toContain('update:production');
    expect(ops).not.toContain('rollout');
    expect(ops.slice(-2)).toEqual(['lease:release', 'record']);
    // The failure travels as the thrown error; the process exit code stays the entry point's business.
    expect(process.exitCode).toBe(exitCodeBefore);
  });

  it('names the release’s boot accounts in the record, releases the lock, and skips publish when the rollout fails', async () => {
    const { fx, ops, records } = makeFake({ rolloutFails: true });
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/cutover failed/);
    expect(records.at(-1)?.record.boot).toEqual([{ service: 'backend', key: 'backend-20261025T200000Z-boot.log', failed: true }, { service: 'cdc' }]);
    expect(ops).not.toContain('publish-entry');
    expect(ops.slice(-2)).toEqual(['lease:release', 'record']);
  });

  it('a frontend-less registry (empty frontend_bucket) builds no frontend and publishes no entry file', async () => {
    const { fx, ops, taskArgs } = makeFake();
    const frontendless = async (opts: DeployOptions) => ({ ...(await fakeDeployEnv(opts)), frontend_bucket: '' });
    await runDeploy(baseOpts, fx, frontendless);
    const build = taskArgs['build-release'] ?? [];
    expect(build[build.indexOf('--dist') + 1]).toBe('');
    expect(ops).not.toContain('publish-entry');
    expect(ops).toContain('task:smoke');
    expect(ops.slice(-2)).toEqual(['lease:release', 'record']);
  });

  it('fails before publishing when a service does not serve the expected version', async () => {
    const { fx, ops } = makeFake({ verifyFails: true });
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/does not serve/);
    expect(ops).not.toContain('publish-entry');
    expect(ops.slice(-2)).toEqual(['lease:release', 'record']);
  });

  it('publishes and smoke-tests the entry files the build wrote', async () => {
    const { fx, taskArgs } = makeFake();
    await runDeploy(baseOpts, fx, fakeDeployEnv);
    const build = taskArgs['build-release'] ?? [];
    const distDir = build[build.indexOf('--dist') + 1] ?? '';
    expect(distDir).toMatch(/release-/);
    expect(build.slice(0, 4)).toEqual(['--sha', 'abc123', '--mode', 'production']);
    const smoke = taskArgs.smoke ?? [];
    expect(smoke[smoke.indexOf('--dist') + 1]).toBe(`${distDir}/index.html`);
  });

  it('must not change the stack once another run took its lock (C7): the next step stops the run', async () => {
    const { fx, ops } = makeFake({ leaseLost: true });
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/taken by another run/);
    expect(ops).not.toContain('update:production');
    expect(ops).not.toContain('rollout');
  });

  it('keeps the displaced machines until smoke passed: the rollout skips the reap, the deploy reaps last', async () => {
    const { fx, ops, rolloutArgs } = makeFake();
    await runDeploy(baseOpts, fx, fakeDeployEnv);
    expect(rolloutArgs[0]).toContain('--skip-reap');
    expect(ops.lastIndexOf('update:production')).toBeGreaterThan(ops.indexOf('task:smoke'));
  });
});

describe('what the deploy runs', () => {
  it('runs no build and needs no Docker: the app code runs on the builder machine, never beside the deploy key, and a job has no daemon', async () => {
    const { fx, execCalls } = makeFake();
    await runDeploy(baseOpts, fx, fakeDeployEnv);
    expect([...new Set(execCalls.map((call) => `${call.cmd} ${call.args[0]}`))].sort()).toEqual(['pulumi login', 'pulumi stack']);
  });
});

describe('the run record', () => {
  it('keeps every step with its duration, and ends deployed, in the diagnostics bucket', async () => {
    const { fx, records, ops } = makeFake();
    await runDeploy({ ...baseOpts, run: 'run-1' }, fx, fakeDeployEnv);
    const written = records.at(-1);
    expect(written?.bucket).toBe('cella-boot-diag');
    expect(written?.record).toMatchObject({ run: 'run-1', environment: 'production', target: 'abc123', outcome: 'deployed' });
    expect(written?.record.failedStep).toBeUndefined();
    expect(written?.record.steps.map((step) => step.title)).toContain('Waved rollout');
    expect(written?.log).toContain('[deploy] Smoke tests: ok');
    expect(ops.at(-1)).toBe('record');
    // Written as the run goes too: a run killed at the job's limit leaves the steps it got through.
    expect(records.some(({ record }) => record.outcome === 'running' && record.steps.some((step) => step.title === 'Waved rollout'))).toBe(true);
  });

  it('is written when the deploy fails too, naming the step and the error', async () => {
    const { fx, records } = makeFake({ rolloutFails: true });
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/cutover failed/);
    expect(records.at(-1)?.record).toMatchObject({ outcome: 'failed', failedStep: 'Waved rollout', error: 'cutover failed' });
    expect(records.at(-1)?.log).toContain('[deploy] Waved rollout: failed');
  });

  it('ends blocked, not failed, when the preflight found an owed privileged change', async () => {
    const { fx, records } = makeFake();
    const task = fx.task;
    fx.task = async (name, argv) => {
      if (name === 'preflight-privileged') throw new ExitCodeError('an apply is owed', 2);
      return task(name, argv);
    };
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/apply is owed/);
    expect(records.at(-1)?.record).toMatchObject({ outcome: 'blocked', failedStep: 'Preflight privileged changes' });
  });

  it('must not fail a deploy whose record cannot be written', async () => {
    const { fx } = makeFake();
    fx.writeRunRecord = async () => {
      throw new Error('bucket refused');
    };
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).resolves.toBeUndefined();
  });
});

describe('deployFailureHint', () => {
  it('names the step it stopped at, and points at the boot accounts only once machines booted', async () => {
    const early = makeFake();
    const task = early.fx.task;
    early.fx.task = async (name, argv) => {
      if (name === 'build-release') throw new Error('the builder failed');
      return task(name, argv);
    };
    const buildError = await runDeploy(baseOpts, early.fx, fakeDeployEnv).catch((err: unknown) => err);
    expect(deployFailureHint(buildError, 'staging')).toEqual({
      description: 'It stopped at "Build the release". Re-running is safe: generations are content-addressed.',
    });

    const late = makeFake({ rolloutFails: true });
    const rolloutError = await runDeploy(baseOpts, late.fx, fakeDeployEnv).catch((err: unknown) => err);
    expect(deployFailureHint(rolloutError, 'staging')).toMatchObject({
      description: expect.stringContaining('"Waved rollout"'),
      command: 'pnpm infra runs --mode staging',
    });
  });
});
