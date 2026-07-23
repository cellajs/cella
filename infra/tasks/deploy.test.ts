import { describe, expect, it } from 'vitest'
import { type DeployEffects, type DeployOptions, parseDeployArgs, runDeploy } from './deploy'
import type { AllowedKey } from './print-deploy-env'

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
    vm_reader_app: 'cella-vm-reader',
    enabled_services_json: JSON.stringify([{ service: 'backend' }, { service: 'cdc' }, { service: 'frontend' }]),
    build_images_matrix: JSON.stringify([{ service: 'backend', dockerfile: 'Dockerfile', target: 'backend' }]),
    primary_rollout_matrix: JSON.stringify([{ service: 'backend', health_url: 'https://www.cellajs.com/api' }]),
    roll_rest_matrix: JSON.stringify([{ service: 'cdc', health_url: '' }, { service: 'frontend', health_url: 'https://www.cellajs.com' }]),
  }
}

function makeFake(opts: { rolloutFails?: boolean; verifyFails?: boolean } = {}) {
  const ops: string[] = []
  const fx: DeployEffects = {
    exec: (cmd, args, execOpts) => {
      const label = cmd === 'pnpm' ? (args[2] ?? '').replace('tasks/', '').replace('.ts', '') : `${cmd}:${args[0]}`
      ops.push(`exec:${label}${execOpts?.allowFailure ? ':allow-failure' : ''}`)
    },
    rollout: async () => {
      ops.push('rollout')
      if (opts.rolloutFails) throw new Error('cutover failed')
    },
    verifyVersion: async (url) => {
      ops.push(`verify:${url}`)
      return !opts.verifyFails
    },
    publishEntryFiles: async () => {
      ops.push('publish-entry')
    },
    bootDiagnostics: async () => {
      ops.push('boot-diag')
    },
    group: () => {},
    groupEnd: () => {},
    info: () => {},
  }
  return { fx, ops }
}

const baseOpts = { mode: 'production', sha: 'abc123', distDir: '/tmp/dist' }

describe('parseDeployArgs', () => {
  it('parses flags and refuses non-pinned tags', () => {
    expect(parseDeployArgs(['--mode', 'staging', '--sha', 'abc', '--dist', 'dist'])).toEqual({
      mode: 'staging',
      sha: 'abc',
      distDir: 'dist',
      gitRef: undefined,
    })
    expect(() => parseDeployArgs(['--mode', 'staging', '--sha', 'latest'])).toThrow(/non-pinned/)
    expect(() => parseDeployArgs(['--mode', 'staging'])).toThrow(/Usage/)
  })
})

describe('runDeploy sequencing', () => {
  it('runs preflights, rollout, verification, entry publish, smoke, then releases the lock', async () => {
    const { fx, ops } = makeFake()
    await runDeploy(baseOpts, fx, fakeDeployEnv)

    // Ordering spine: lock before any stack mutation, rollout after preflights,
    // publish only after verification, lock release last.
    const spine = [
      'exec:ensure-state-bucket',
      'exec:pulumi:login',
      'exec:stack-lock',
      'exec:wait-for-images',
      'rollout',
      'publish-entry',
      'exec:smoke',
      'exec:stack-lock:allow-failure',
    ]
    let cursor = -1
    for (const op of spine) {
      const index = ops.indexOf(op, cursor + 1)
      expect(index, `${op} missing or out of order in: ${ops.join(', ')}`).toBeGreaterThan(cursor)
      cursor = index
    }
    // Public version verification covers every LB-exposed service.
    expect(ops.some((op) => op.startsWith('verify:') && op.endsWith('/health'))).toBe(true)
    expect(ops).not.toContain('boot-diag')
  })

  it('collects boot diagnostics, releases the lock, and skips publish when the rollout fails', async () => {
    const { fx, ops } = makeFake({ rolloutFails: true })
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/cutover failed/)
    expect(ops).toContain('boot-diag')
    expect(ops).not.toContain('publish-entry')
    expect(ops.at(-1)).toBe('exec:stack-lock:allow-failure')
  })

  it('fails before publishing when a service does not serve the expected version', async () => {
    const { fx, ops } = makeFake({ verifyFails: true })
    await expect(runDeploy(baseOpts, fx, fakeDeployEnv)).rejects.toThrow(/does not serve/)
    expect(ops).not.toContain('publish-entry')
    expect(ops.at(-1)).toBe('exec:stack-lock:allow-failure')
  })

  it('skips entry publish and smoke without a dist dir', async () => {
    const { fx, ops } = makeFake()
    await runDeploy({ mode: 'production', sha: 'abc123' }, fx, fakeDeployEnv)
    expect(ops).not.toContain('publish-entry')
    expect(ops).not.toContain('exec:smoke')
    expect(ops).toContain('rollout')
  })

  it('rejects production deploys from untrusted refs before touching anything', async () => {
    const { fx, ops } = makeFake()
    await expect(runDeploy({ ...baseOpts, gitRef: 'refs/heads/feature' }, fx, fakeDeployEnv)).rejects.toThrow(/only allowed/)
    expect(ops).toHaveLength(0)
  })

  it('accepts production deploys from release tags', async () => {
    const { fx } = makeFake()
    await expect(runDeploy({ ...baseOpts, gitRef: 'refs/tags/1.2.3' }, fx, fakeDeployEnv)).resolves.toBeUndefined()
  })
})
