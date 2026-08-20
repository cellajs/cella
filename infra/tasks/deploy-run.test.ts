import { describe, expect, it } from 'vitest';
import {
  type DeployEffects,
  type DeployOptions,
  parseDeployArgs,
  parseReapArgs,
  runDeploy,
  runReap,
} from './deploy-run';
import type { AllowedKey } from './print-deploy-env';

/** Cella-shaped deploy env table, injected in place of the shared config load. */
async function fakeDeployEnv(opts: DeployOptions): Promise<Record<AllowedKey, string>> {
  return {
    environment: opts.mode,
    image_tag: opts.sha,
    pulumi_stack: opts.mode,
    region: 'fr-par',
    registry_ns: 'cella-registry',
    frontend_bucket: 'cella-frontend',
    state_bucket: 'cella-pulumi-state',
    vm_assert_json: JSON.stringify([
      {
        app: 'cella-production-vm-backend',
        sets: ['SecretManagerReadOnly', 'SecretManagerSecretAccess'],
        condition: 'resource.name.startsWith("/cella-production/backend/")',
      },
      {
        app: 'cella-production-boot',
        sets: ['ContainerRegistryReadOnly', 'ObjectStorageObjectsWrite'],
        condition: 'resource.name.startsWith("/cella-production/handoff/")',
      },
    ]),
    enabled_services_json: JSON.stringify([
      // health_url mirrors print-deploy-env: set for LB-exposed services
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

function makeFake(opts: { rolloutFails?: boolean; verifyFails?: boolean; updateFails?: boolean } = {}) {
  const ops: string[] = [];
  const rolloutArgs: string[][] = [];
  const fx: DeployEffects = {
    initTelemetry: async () => {
      ops.push('telemetry:init');
    },
    uploadAssets: async () => {
      ops.push('upload-assets');
    },
    task: async (name, argv = []) => {
      ops.push(`task:${name}${argv[0] && !argv[0].startsWith('--') ? `:${argv[0]}` : ''}`);
    },
    exec: async (cmd, args, execOpts) => {
      ops.push(`exec:${cmd}:${args[0]}${execOpts?.allowFailure ? ':allow-failure' : ''}`);
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
    bootDiagnostics: async () => {
      ops.push('boot-diag');
    },
    group: () => {},
    groupEnd: () => {},
    info: () => {},
  };
  return { fx, ops, rolloutArgs };
}

const baseOpts = { mode: 'production', sha: 'abc123', distDir: '/tmp/dist' };

describe('parseDeployArgs', () => {
  it('parses flags and refuses non-pinned tags', () => {
    expect(parseDeployArgs(['--mode', 'staging', '--sha', 'abc', '--dist', 'dist'])).toEqual({
      mode: 'staging',
      sha: 'abc',
      distDir: 'dist',
      build: false,
      gitRef: undefined,
      deferReap: false,
    });
    expect(parseDeployArgs(['--mode', 'staging', '--sha', 'abc', '--build']).build).toBe(true);
    expect(parseDeployArgs(['--mode', 'staging', '--sha', 'abc', '--defer-reap']).deferReap).toBe(true);
    expect(() => parseDeployArgs(['--mode', 'staging', '--sha', 'latest'])).toThrow(/non-pinned/);
    expect(() => parseDeployArgs(['--mode', 'staging'])).toThrow(/Usage/);
  });
});

describe('runDeploy sequencing', () => {
  it('runs preflights, rollout, verification, entry publish, smoke, then releases the lock', async () => {
    const { fx, ops } = makeFake();
    await runDeploy(baseOpts, fx, fakeDeployEnv);

    // Ordering spine: lock before any stack mutation, generation keys minted
    // before the stack update bakes their references, per-principal grant
    // verification after the update, rollout after preflights, publish only
    // after verification, lock release last.
    const spine = [
      'task:ensure-state-bucket',
      'exec:pulumi:login',
      'task:stack-lock:acquire',
      'task:wait-for-images',
      'task:mint-generation-keys',
      'update:production',
      'task:assert-vm-grants',
      'rollout',
      'publish-entry',
      'task:smoke',
      'task:stack-lock:release',
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
    expect(ops).not.toContain('boot-diag');
  });

  it('collects boot diagnostics, releases the lock, and skips publish when the rollout fails', async () => {
    const { fx, ops } = makeFake({ rolloutFails: true });
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/cutover failed/);
    expect(ops).toContain('boot-diag');
    expect(ops).not.toContain('publish-entry');
    expect(ops.at(-1)).toBe('task:stack-lock:release');
  });

  it('a frontend-less registry (empty frontend_bucket) skips build, asset upload, and entry publish', async () => {
    const { fx, ops } = makeFake();
    const frontendless = async (opts: DeployOptions) => ({ ...(await fakeDeployEnv(opts)), frontend_bucket: '' });
    await runDeploy({ ...baseOpts, distDir: undefined as unknown as string }, fx, frontendless);
    expect(ops).not.toContain('exec:pnpm:--filter');
    expect(ops).not.toContain('upload-assets');
    expect(ops).not.toContain('publish-entry');
    expect(ops).toContain('task:smoke');
    expect(ops.at(-1)).toBe('task:stack-lock:release');
  });

  it('fails before publishing when a service does not serve the expected version', async () => {
    const { fx, ops } = makeFake({ verifyFails: true });
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/does not serve/);
    expect(ops).not.toContain('publish-entry');
    expect(ops.at(-1)).toBe('task:stack-lock:release');
  });

  it('builds the frontend itself when no dist dir is provided', async () => {
    const { fx, ops } = makeFake();
    await runDeploy({ mode: 'production', sha: 'abc123' }, fx, fakeDeployEnv);
    expect(ops).toContain('exec:pnpm:--filter');
    expect(ops).toContain('upload-assets');
    expect(ops).toContain('publish-entry');
    expect(ops).toContain('task:smoke');
  });

  it('the registry wait progresses while the frontend build runs (exec must not block it)', async () => {
    const { fx, ops } = makeFake();
    const fxConcurrent: DeployEffects = {
      ...fx,
      exec: async (cmd, args) => {
        // The fake build finishes only after the concurrent images branch completed its registry wait; a build that blocks that branch deadlocks this test.
        if (cmd === 'pnpm' && args[0] === '--filter') {
          while (!ops.includes('task:wait-for-images')) await new Promise((tick) => setTimeout(tick, 1));
        }
        ops.push(`exec:${cmd}:${args[0]}`);
      },
    };
    await runDeploy({ mode: 'production', sha: 'abc123' }, fxConcurrent, fakeDeployEnv);
    expect(ops.indexOf('task:wait-for-images')).toBeLessThan(ops.indexOf('exec:pnpm:--filter'));
  });

  it('skips the frontend build (but still uploads) with a prebuilt dist dir', async () => {
    const { fx, ops } = makeFake();
    await runDeploy(baseOpts, fx, fakeDeployEnv);
    expect(ops).not.toContain('exec:pnpm:--filter');
    expect(ops).toContain('upload-assets');
  });

  it('bakes and pushes images in-process with --build', async () => {
    const { fx, ops } = makeFake();
    await runDeploy({ ...baseOpts, build: true }, fx, fakeDeployEnv);
    expect(ops).toContain('exec:docker:buildx');
    const bakeIndex = ops.indexOf('exec:docker:buildx');
    const waitIndex = ops.indexOf('task:wait-for-images');
    expect(bakeIndex).toBeGreaterThan(-1);
    expect(waitIndex).toBeGreaterThan(bakeIndex);
  });

  it('passes --skip-reap to the rollout only with deferReap', async () => {
    const withDefer = makeFake();
    await runDeploy({ ...baseOpts, deferReap: true }, withDefer.fx, fakeDeployEnv);
    expect(withDefer.rolloutArgs[0]).toContain('--skip-reap');

    const without = makeFake();
    await runDeploy(baseOpts, without.fx, fakeDeployEnv);
    expect(without.rolloutArgs[0]).not.toContain('--skip-reap');
  });

  it('rejects production deploys from untrusted refs before touching anything', async () => {
    const { fx, ops } = makeFake();
    await expect(runDeploy({ ...baseOpts, gitRef: 'refs/heads/feature' }, fx, fakeDeployEnv)).rejects.toThrow(
      /only allowed/,
    );
    expect(ops).toHaveLength(0);
  });

  it('accepts production deploys from release tags', async () => {
    const { fx } = makeFake();
    await expect(runDeploy({ ...baseOpts, gitRef: 'refs/tags/1.2.3' }, fx, fakeDeployEnv)).resolves.toBeUndefined();
  });
});

describe('parseReapArgs', () => {
  it('requires mode and sha', () => {
    expect(parseReapArgs(['--mode', 'production', '--sha', 'abc123'])).toEqual({ mode: 'production', sha: 'abc123' });
    expect(() => parseReapArgs(['--mode', 'production'])).toThrow(/Usage/);
    expect(() => parseReapArgs(['--sha', 'abc123'])).toThrow(/Usage/);
  });
});

describe('runReap sequencing', () => {
  it('logs in, locks, updates the stack, then releases the lock', async () => {
    const { fx, ops } = makeFake();
    await runReap({ mode: 'production', sha: 'abc123' }, fx, fakeDeployEnv);
    expect(ops).toEqual([
      'exec:pulumi:login',
      'exec:pulumi:stack',
      'task:stack-lock:acquire',
      'task:install-pulumi-providers',
      'update:production',
      'task:stack-lock:release',
    ]);
  });

  it('releases the lock when the update fails', async () => {
    const { fx, ops } = makeFake({ updateFails: true });
    await expect(runReap({ mode: 'production', sha: 'abc123' }, fx, fakeDeployEnv)).rejects.toThrow(
      /stack update failed/,
    );
    expect(ops.at(-1)).toBe('task:stack-lock:release');
  });
});
