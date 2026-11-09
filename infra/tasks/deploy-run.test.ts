import { describe, expect, it } from 'vitest';
import type { ServiceName } from '../compose/compose';
import type { EngineStamp } from '../lib/deploy/applied-engine';
import type { LiveRecord } from '../lib/deploy/live-record';
import type { RunRecord } from '../lib/deploy/run-record';
import type { MachineRole } from '../lib/machine-roles';
import { ExitCodeError } from '../lib/utils/errors';
import type { AllowedKey } from './deploy-env';
import { type DeployEffects, type DeployOptions, deployFailureHint, parseDeployArgs, runDeploy, type SwitchRequest } from './deploy-run';

const SHA = 'abc1230000000000000000000000000000000000';
const DESCRIPTION = 'd'.repeat(64);

/** Cella-shaped deploy env table, injected in place of the shared config load. */
async function fakeDeployEnv(opts: DeployOptions): Promise<Record<AllowedKey, string>> {
  return {
    environment: opts.mode,
    image_tag: opts.sha,
    stack: opts.mode,
    region: 'fr-par',
    public_bucket: '',
    frontend_bucket: 'cella-frontend',
    diag_bucket: 'cella-boot-diag',
    enabled_services_json: JSON.stringify([
      { service: 'backend', public_url: 'https://www.cellajs.com/api', health_url: 'https://www.cellajs.com/api' },
      { service: 'cdc', public_url: '', health_url: '' },
      { service: 'frontend', public_url: 'https://www.cellajs.com', health_url: 'https://www.cellajs.com' },
    ]),
    build_images_matrix: JSON.stringify([{ service: 'backend', dockerfile: 'Dockerfile', target: 'backend' }]),
    primary_role: 'backend',
  };
}

const role = (name: ServiceName, primary = false): MachineRole => ({
  role: name,
  services: [],
  pools: [],
  strategy: 'start-first',
  drainSeconds: 0,
  primary,
});
const ROLES = [role('backend', true), role('cdc'), role('frontend')];
const serving = (commit: string, retry = 0, rotation = 0): LiveRecord => ({
  schemaVersion: 1,
  roles: Object.fromEntries(ROLES.map((r, index) => [r.role, { slot: 'a', machine: `srv-${index}`, commit, retry, rotation }])),
});

function makeFake(
  opts: {
    live?: LiveRecord;
    rotation?: number;
    switchFails?: boolean;
    leaseLost?: boolean;
    stamp?: EngineStamp | null;
    description?: string | null;
    describes?: Record<string, unknown>;
  } = {},
) {
  const ops: string[] = [];
  const taskArgs: Record<string, string[]> = {};
  const switches: SwitchRequest[] = [];
  const records: Array<{ bucket: string; record: RunRecord; log: string }> = [];
  const fx: DeployEffects = {
    task: async (name, argv = []) => {
      ops.push(`task:${name}${argv.includes('--no-wait') ? ':no-wait' : ''}${argv.includes('--check') ? ':check' : ''}`);
      taskArgs[name] = [...argv];
    },
    readFile: async (path) =>
      path.endsWith('manifest.json')
        ? JSON.stringify({
            release: SHA,
            images: {},
            ...(opts.description === null ? {} : { description: opts.description ?? DESCRIPTION }),
            ...(opts.describes ? { describes: opts.describes } : {}),
          })
        : '[]',
    lease: async (_stack, operation) => {
      ops.push(`lease:acquire:${operation}`);
      return {
        release: async () => {
          ops.push('lease:release');
        },
        lost: opts.leaseLost === true,
      };
    },
    readLive: async () => {
      ops.push('live:read');
      return { roles: ROLES, record: opts.live ?? { schemaVersion: 1, roles: {} }, rotation: opts.rotation ?? 0 };
    },
    engineStamp: () => (opts.stamp === null ? undefined : (opts.stamp ?? { mode: 'production', descriptionHash: DESCRIPTION })),
    engineDescription: async () => ({ services: { backend: {} } }),
    switchMachines: async (request) => {
      ops.push(`switch:${request.pending.join(',')}`);
      switches.push(request);
      request.switched.push({ role: 'backend', slot: 'b', machine: 'srv-new' });
      if (opts.switchFails) throw new Error('frontend: it did not serve within 480 s on slot b');
    },
    publishEntryFiles: async () => {
      ops.push('publish-entry');
    },
    bootAccounts: async (envs) => {
      ops.push(`boot-diag:${envs.length}`);
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
  return { fx, ops, taskArgs, switches, records };
}

const baseOpts: DeployOptions = { mode: 'production', sha: SHA, retry: 0 };

describe('parseDeployArgs', () => {
  it('parses flags and refuses non-pinned tags', () => {
    expect(parseDeployArgs(['--mode', 'staging', '--sha', 'abc', '--retry', '2'])).toEqual({ mode: 'staging', sha: 'abc', retry: 2, run: undefined });
    expect(parseDeployArgs(['--mode', 'staging', '--sha', 'abc']).retry).toBe(0);
    expect(() => parseDeployArgs(['--mode', 'staging', '--sha', 'latest'])).toThrow(/non-pinned/);
    expect(() => parseDeployArgs(['--mode', 'staging'])).toThrow(/Usage/);
  });
});

describe('runDeploy sequencing', () => {
  it('takes the lease, reads the live record, builds, composes, switches, takes the links off, publishes, smoke-tests, then releases the lease', async () => {
    const { fx, ops } = makeFake();
    await runDeploy(baseOpts, fx, fakeDeployEnv);
    const spine = [
      'lease:acquire:deploy',
      'live:read',
      // A required value the runtime folder lacks stops the run before a builder is made; the build reports the target's description,
      // which is checked before any value is read.
      'task:compose-env:check',
      'task:build-release',
      'task:compose-env',
      'switch:backend,cdc,frontend',
      'task:clear-machine-links',
      'publish-entry',
      'task:smoke',
      'lease:release',
    ];
    let cursor = -1;
    for (const op of spine) {
      const index = ops.indexOf(op, cursor + 1);
      expect(index, `${op} missing or out of order in: ${ops.join(', ')}`).toBeGreaterThan(cursor);
      cursor = index;
    }
    expect(ops.some((op) => op.startsWith('boot-diag'))).toBe(false);
  });

  it('refreshes GeoIP data before the switch when a public bucket exists, and shrugs off a failure', async () => {
    const withBucket = async (o: DeployOptions) => ({ ...(await fakeDeployEnv(o)), public_bucket: 'cella-public' });
    const failing = makeFake();
    const task = failing.fx.task;
    failing.fx.task = async (name, argv) => {
      if (name === 'geoip-refresh') throw new Error('db-ip down');
      return task(name, argv);
    };
    await runDeploy(baseOpts, failing.fx, withBucket);
    expect(failing.ops.some((op) => op.startsWith('switch:'))).toBe(true);
    const ok = makeFake();
    await runDeploy(baseOpts, ok.fx, withBucket);
    expect(ok.ops.indexOf('task:geoip-refresh')).toBeLessThan(ok.ops.indexOf('switch:backend,cdc,frontend'));
  });

  it('switches the roles the live record says do not serve the target, under the retry counter and the rotation', async () => {
    const live = serving('b'.repeat(40));
    live.roles.backend = { slot: 'b', machine: 'srv-9', commit: SHA, retry: 0, rotation: 3 };
    const { fx, switches } = makeFake({ live, rotation: 3 });
    await runDeploy(baseOpts, fx, fakeDeployEnv);
    expect(switches[0]?.pending).toEqual(['cdc', 'frontend']);
    expect(switches[0]?.target).toEqual({ commit: SHA, retry: 0, rotation: 3 });
    expect(switches[0]?.stack).toBe('production');
  });

  it('names the release’s boot accounts in the record, releases the lease, and skips publish when a switch fails', async () => {
    const { fx, ops, records, taskArgs } = makeFake({ switchFails: true });
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/did not serve/);
    expect(records.at(-1)?.record.boot).toEqual([{ service: 'backend', key: 'backend-20261025T200000Z-boot.log', failed: true }, { service: 'cdc' }]);
    expect(ops).not.toContain('publish-entry');
    // No env file outlives the run, and the machine that switched loses its links.
    expect(ops.slice(-3)).toEqual(['task:clear-machine-links:no-wait', 'lease:release', 'record']);
    expect(taskArgs['clear-machine-links']).toContain('--machines');
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

  it('publishes and smoke-tests the entry files the build wrote', async () => {
    const { fx, taskArgs } = makeFake();
    await runDeploy(baseOpts, fx, fakeDeployEnv);
    const build = taskArgs['build-release'] ?? [];
    const distDir = build[build.indexOf('--dist') + 1] ?? '';
    expect(distDir).toMatch(/release-/);
    expect(build.slice(0, 4)).toEqual(['--sha', SHA, '--mode', 'production']);
    const smoke = taskArgs.smoke ?? [];
    expect(smoke[smoke.indexOf('--dist') + 1]).toBe(`${distDir}/index.html`);
    expect(smoke[smoke.indexOf('--primary') + 1]).toBe('backend');
  });

  it('must not change anything once another run took its lease: the next step stops the run', async () => {
    const { fx, ops } = makeFake({ leaseLost: true });
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/taken by another run/);
    expect(ops.some((op) => op.startsWith('switch:'))).toBe(false);
  });
});

describe('the same deploy twice', () => {
  it('changes nothing when every role serves the target under the same retry counter and rotation: no build, no machine', async () => {
    const { fx, ops, records } = makeFake({ live: serving(SHA) });
    await runDeploy(baseOpts, fx, fakeDeployEnv);
    expect(ops.filter((op) => op.startsWith('task:') || op.startsWith('switch:'))).toEqual([]);
    expect(records.at(-1)?.record.outcome).toBe('unchanged');
  });

  it('replaces every machine of the live commit after a raised retry counter or a rotation', async () => {
    for (const [opts, fake] of [
      [{ ...baseOpts, retry: 1 }, makeFake({ live: serving(SHA) })],
      [baseOpts, makeFake({ live: serving(SHA), rotation: 1 })],
    ] as const) {
      await runDeploy(opts, fake.fx, fakeDeployEnv);
      expect(fake.switches[0]?.pending).toEqual(['backend', 'cdc', 'frontend']);
      expect(fake.records.at(-1)?.record.outcome).toBe('deployed');
    }
  });
});

describe('the run record', () => {
  it('keeps every step with its duration, and ends deployed, in the diagnostics bucket', async () => {
    const { fx, records, ops } = makeFake();
    await runDeploy({ ...baseOpts, run: 'run-1' }, fx, fakeDeployEnv);
    const written = records.at(-1);
    expect(written?.bucket).toBe('cella-boot-diag');
    expect(written?.record).toMatchObject({ run: 'run-1', environment: 'production', target: SHA, outcome: 'deployed' });
    expect(written?.record.failedStep).toBeUndefined();
    expect(written?.record.steps.map((step) => step.title)).toContain('Switch machines');
    expect(written?.log).toContain('[deploy] Smoke tests: ok');
    expect(ops.at(-1)).toBe('record');
    // Written as the run goes too: a run killed at the job's limit leaves the steps it got through.
    expect(records.some(({ record }) => record.outcome === 'running' && record.steps.some((step) => step.title === 'Switch machines'))).toBe(true);
  });

  it('is written when the deploy fails too, naming the step and the error', async () => {
    const { fx, records } = makeFake({ switchFails: true });
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/did not serve/);
    expect(records.at(-1)?.record).toMatchObject({ outcome: 'failed', failedStep: 'Switch machines' });
    expect(records.at(-1)?.log).toContain('[deploy] Switch machines: failed');
  });

  it('ends blocked, not failed, when a required runtime value is missing, before any machine exists, the builder included', async () => {
    const { fx, records, ops } = makeFake();
    const task = fx.task;
    fx.task = async (name, argv) => {
      if (name === 'compose-env' && argv?.includes('--check')) throw new ExitCodeError('Blocked: required runtime values are not set', 2);
      return task(name, argv);
    };
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/not set/);
    expect(records.at(-1)?.record).toMatchObject({ outcome: 'blocked', failedStep: 'Check runtime secrets' });
    expect(ops.some((op) => op.startsWith('task:build-release') || op.startsWith('switch:'))).toBe(false);
  });

  it('ends "apply needed", exit 2, before any build for a run outside the engine image or one built for another environment', async () => {
    for (const fake of [makeFake({ stamp: null }), makeFake({ stamp: { mode: 'staging', descriptionHash: DESCRIPTION } })]) {
      const error = await runDeploy(baseOpts, fake.fx, fakeDeployEnv).catch((err: unknown) => err);
      expect((error as ExitCodeError).exitCode).toBe(2);
      expect(fake.records.at(-1)?.record).toMatchObject({ outcome: 'apply needed', failedStep: 'Check the engine' });
      expect(fake.records.at(-1)?.record.error).toMatch(/^apply needed: /);
      expect(fake.ops.some((op) => op.startsWith('task:'))).toBe(false);
      expect(deployFailureHint(error, 'production')).toMatchObject({ command: 'pnpm infra apply --mode production' });
    }
  });

  it('ends "apply needed", exit 2, before any value is read, for a target whose description differs or is missing', async () => {
    const differs = makeFake({ description: 'e'.repeat(64) });
    const error = await runDeploy(baseOpts, differs.fx, fakeDeployEnv).catch((err: unknown) => err);
    expect((error as ExitCodeError).exitCode).toBe(2);
    expect(differs.records.at(-1)?.record).toMatchObject({ outcome: 'apply needed', failedStep: 'Check the description' });
    expect(differs.records.at(-1)?.record.error).toMatch(/^apply needed: /);
    expect(differs.ops).not.toContain('task:compose-env');
    expect(deployFailureHint(error, 'production')).toMatchObject({ command: 'pnpm infra apply --mode production' });

    // A builder that reported the description beside its hash: the error names what the target changes.
    const named = makeFake({ description: 'e'.repeat(64), describes: { services: { backend: {}, search: {} } } });
    await runDeploy(baseOpts, named.fx, fakeDeployEnv).catch(() => undefined);
    expect(named.records.at(-1)?.record.error).toMatch(/changes the infrastructure: services\.search added; an apply from a checkout at it/);

    // A commit older than the applied engine reports none, and no apply deploys it.
    const predates = makeFake({ description: null });
    const older = await runDeploy(baseOpts, predates.fx, fakeDeployEnv).catch((err: unknown) => err);
    expect(predates.records.at(-1)?.record).toMatchObject({ outcome: 'apply needed', failedStep: 'Check the description' });
    expect(deployFailureHint(older, 'production')).toEqual({
      description: expect.stringContaining('pin a newer release in infra/environments, or roll forward'),
    });
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
      description: 'It stopped at "Build the release". Re-running is safe: the live record says what serves.',
    });

    const late = makeFake({ switchFails: true });
    const switchError = await runDeploy(baseOpts, late.fx, fakeDeployEnv).catch((err: unknown) => err);
    expect(deployFailureHint(switchError, 'staging')).toMatchObject({
      description: expect.stringContaining('"Switch machines"'),
      command: 'pnpm infra runs --mode staging',
    });
  });
});
