import { describe, expect, it } from 'vitest'
import type { GenerationMetadata } from '../lib/generation-metadata'
import type { ServiceRollout } from '../lib/stack/control-store'
import { activateService, resolvePendingGen, type RolloutRuntime, type RolloutServicePlan, runWavedRollout } from './rollout'

const SHA = 'sha-new'

function gen(service: string, genId: string, sha: string, privateIp: string): GenerationMetadata {
  return {
    service: service as GenerationMetadata['service'],
    genId,
    sha,
    name: `vm-${service}-${genId}`,
    serverId: `srv-${genId}`,
    privateIp,
    privateNicId: `nic-${genId}`,
  }
}

interface FakeOptions {
  generations: GenerationMetadata[]
  /** Pre-deploy active generation per service. */
  active?: Record<string, { id: string; sha: string }>
  backendIds?: Record<string, string>
  /** Health URLs whose gate reports unhealthy. */
  unhealthyUrls?: string[]
  /** Initial LB server list per backend id. */
  initialLb?: Record<string, string[]>
  /** Simulate a stack with no LB outputs at all. */
  failBackendIdsRead?: boolean
}

function makeFake(opts: FakeOptions) {
  const ops: string[] = []
  const control = new Map<string, ServiceRollout>()
  for (const [service, active] of Object.entries(opts.active ?? {})) {
    control.set(service, { seq: 1, active: { ...active, seq: 1 } })
  }
  const lbHistory = new Map<string, string[][]>()
  const serversOf = (backendId: string): string[][] => {
    let history = lbHistory.get(backendId)
    if (!history) {
      history = [opts.initialLb?.[backendId] ?? []]
      lbHistory.set(backendId, history)
    }
    return history
  }

  const rt: RolloutRuntime = {
    update: async () => {
      ops.push('update')
    },
    reap: async () => {
      ops.push('reap')
    },
    readGenerations: async () => opts.generations,
    readLbBackendIds: async () => {
      if (opts.failBackendIdsRead) throw new Error('stack output lbBackendIds missing')
      return opts.backendIds ?? {}
    },
    currentRollout: async (service) => control.get(service),
    setPending: async (service, sha) => {
      ops.push(`pending:${service}`)
      const base = control.get(service) ?? { seq: 0 }
      control.set(service, { ...base, pendingSha: sha })
    },
    promote: async (service, resolved) => {
      ops.push(`promote:${service}:${resolved.id}`)
      const seq = (control.get(service)?.seq ?? 0) + 1
      control.set(service, { seq, active: { ...resolved, seq } })
    },
    lbGetServers: async (backendId) => serversOf(backendId).at(-1) ?? [],
    lbSetServers: async (backendId, ips) => {
      ops.push(`lb:${backendId}:[${ips.join(',')}]`)
      serversOf(backendId).push([...ips])
    },
    healthGate: async (url) => !(opts.unhealthyUrls ?? []).includes(url),
    sleep: async () => {},
    info: () => {},
  }
  return { rt, ops, control, lbHistory }
}

const backendPlan: RolloutServicePlan = {
  service: 'backend',
  strategy: 'lb-overlap',
  drainPolicy: 'requests',
  drainSeconds: 10,
  healthUrl: 'https://api/health',
}
const cdcPlan: RolloutServicePlan = { service: 'cdc', strategy: 'exclusive', drainSeconds: 0 }
const frontendPlan: RolloutServicePlan = {
  service: 'frontend',
  strategy: 'lb-overlap',
  drainPolicy: 'requests',
  drainSeconds: 0,
  healthUrl: 'https://app/health',
}

/** cella-shaped fixture: backend + frontend behind the LB, cdc exclusive. */
function cellaFixture(): FakeOptions {
  return {
    generations: [
      gen('backend', 'b-old', 'sha-old', '10.0.0.1'),
      gen('backend', 'b-new', SHA, '10.0.0.2'),
      gen('cdc', 'c-new', SHA, '10.0.0.3'),
      gen('frontend', 'f-old', 'sha-old', '10.0.0.4'),
      gen('frontend', 'f-new', SHA, '10.0.0.5'),
    ],
    active: {
      backend: { id: 'b-old', sha: 'sha-old' },
      cdc: { id: 'c-old', sha: 'sha-old' },
      frontend: { id: 'f-old', sha: 'sha-old' },
    },
    backendIds: { backend: 'b-bid', frontend: 'f-bid' },
    initialLb: { 'b-bid': ['10.0.0.1'], 'f-bid': ['10.0.0.4'] },
  }
}

describe('resolvePendingGen', () => {
  const generations = [gen('backend', 'b-old', 'sha-old', '10.0.0.1'), gen('backend', 'b-new', SHA, '10.0.0.2')]

  it('picks the generation whose id differs from the active one', () => {
    expect(resolvePendingGen(generations, 'backend', SHA, 'b-old').genId).toBe('b-new')
  })

  it('collapses to the active generation on a same-config redeploy', () => {
    expect(resolvePendingGen([gen('backend', 'b-new', SHA, '10.0.0.2')], 'backend', SHA, 'b-new').genId).toBe('b-new')
  })

  it('throws when no generation matches', () => {
    expect(() => resolvePendingGen(generations, 'frontend', SHA)).toThrow(/frontend/)
  })
})

describe('runWavedRollout sequencing', () => {
  it('runs wave 1 (primary), wave 2 (rest, one update), then a single dual-plane reap', async () => {
    const fake = makeFake(cellaFixture())
    await runWavedRollout({ sha: SHA, primary: backendPlan, rest: [cdcPlan, frontendPlan] }, fake.rt)

    const updates = fake.ops.filter((op) => op === 'update')
    expect(updates).toHaveLength(2)

    // Wave 1 completes (backend promoted) before wave 2 records any intent.
    const promoteBackend = fake.ops.indexOf('promote:backend:b-new')
    const pendingCdc = fake.ops.indexOf('pending:cdc')
    expect(promoteBackend).toBeGreaterThan(-1)
    expect(pendingCdc).toBeGreaterThan(promoteBackend)

    // Wave 2: both services promoted after ONE shared update; reap is the last op.
    expect(fake.ops).toContain('promote:cdc:c-new')
    expect(fake.ops).toContain('promote:frontend:f-new')
    expect(fake.ops.at(-1)).toBe('reap')

    // Exactly one update between wave-2 pendings and wave-2 promotes.
    const wave2Update = fake.ops.indexOf('update', pendingCdc)
    expect(fake.ops.indexOf('promote:cdc:c-new')).toBeGreaterThan(wave2Update)
    expect(fake.ops.indexOf('promote:frontend:f-new')).toBeGreaterThan(wave2Update)
  })

  it('cuts each lb service over through [old, new] overlap and never empties the pool', async () => {
    const fake = makeFake(cellaFixture())
    await runWavedRollout({ sha: SHA, primary: backendPlan, rest: [cdcPlan, frontendPlan] }, fake.rt)

    expect(fake.lbHistory.get('b-bid')).toEqual([['10.0.0.1'], ['10.0.0.1', '10.0.0.2'], ['10.0.0.2']])
    expect(fake.lbHistory.get('f-bid')).toEqual([['10.0.0.4'], ['10.0.0.4', '10.0.0.5'], ['10.0.0.5']])
    for (const history of fake.lbHistory.values()) {
      for (const [index, servers] of history.entries()) {
        if (index > 0) expect(servers.length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the old generation serving and skips the reap when a wave-2 cutover fails', async () => {
    const fixture = cellaFixture()
    fixture.unhealthyUrls = ['https://app/health']
    const fake = makeFake(fixture)

    await expect(runWavedRollout({ sha: SHA, primary: backendPlan, rest: [cdcPlan, frontendPlan] }, fake.rt)).rejects.toThrow(/frontend/)

    // cdc still promoted; frontend not; no reap after the failure.
    expect(fake.ops).toContain('promote:cdc:c-new')
    expect(fake.ops).not.toContain('promote:frontend:f-new')
    expect(fake.ops).not.toContain('reap')

    // The frontend pool still contains the old, serving generation.
    const frontendServers = fake.lbHistory.get('f-bid')?.at(-1) ?? []
    expect(frontendServers).toContain('10.0.0.4')
  })

  it('supports a rollout without a primary service', async () => {
    const fake = makeFake(cellaFixture())
    await runWavedRollout({ sha: SHA, rest: [cdcPlan, frontendPlan] }, fake.rt)
    expect(fake.ops.filter((op) => op === 'update')).toHaveLength(1)
    expect(fake.ops.at(-1)).toBe('reap')
    expect(fake.ops).toContain('promote:frontend:f-new')
  })

  it('drives the LB straight to [new] on a first deploy with no active generation', async () => {
    const fake = makeFake({
      generations: [gen('backend', 'b-new', SHA, '10.0.0.2')],
      backendIds: { backend: 'b-bid' },
    })
    await runWavedRollout({ sha: SHA, primary: backendPlan, rest: [] }, fake.rt)
    expect(fake.lbHistory.get('b-bid')).toEqual([[], ['10.0.0.2']])
  })

  it('is idempotent when re-run after a completed rollout (no LB writes)', async () => {
    const fake = makeFake({
      generations: [gen('backend', 'b-new', SHA, '10.0.0.2')],
      active: { backend: { id: 'b-new', sha: SHA } },
      backendIds: { backend: 'b-bid' },
      initialLb: { 'b-bid': ['10.0.0.2'] },
    })
    await runWavedRollout({ sha: SHA, primary: backendPlan, rest: [] }, fake.rt)
    expect(fake.ops.filter((op) => op.startsWith('lb:'))).toHaveLength(0)
    expect(fake.ops).toContain('promote:backend:b-new')
  })

  it('skips the LB backend-ids read for an exclusive-only wave', async () => {
    const fake = makeFake({
      generations: [gen('cdc', 'c-new', SHA, '10.0.0.3')],
      failBackendIdsRead: true,
    })
    await runWavedRollout({ sha: SHA, rest: [cdcPlan] }, fake.rt)
    expect(fake.ops).toContain('promote:cdc:c-new')
  })
})

describe('runWavedRollout update batching', () => {
  it('passes each wave’s service set to update and every service to the reap', async () => {
    const fake = makeFake(cellaFixture())
    const waves: string[][] = []
    const reaps: string[][] = []
    const rt: RolloutRuntime = {
      ...fake.rt,
      update: async (services) => {
        waves.push([...services])
      },
      reap: async (services) => {
        reaps.push([...services])
      },
    }
    await runWavedRollout({ sha: SHA, primary: backendPlan, rest: [cdcPlan, frontendPlan] }, rt)
    expect(waves).toEqual([['backend'], ['cdc', 'frontend']])
    expect(reaps).toEqual([['backend', 'cdc', 'frontend']])
  })
})

describe('activateService co-hosted repoint', () => {
  it('repoints co-hosted worker LB backends to the new generation IP after cutover', async () => {
    const fake = makeFake({
      generations: [gen('backend', 'b-old', 'sha-old', '10.0.0.1'), gen('backend', 'b-new', SHA, '10.0.0.2')],
      active: { backend: { id: 'b-old', sha: 'sha-old' } },
      backendIds: { backend: 'b-bid', yjs: 'y-bid', mcp: 'm-bid' },
      initialLb: { 'b-bid': ['10.0.0.1'], 'y-bid': ['10.0.0.1'], 'm-bid': ['10.0.0.1'] },
    })
    const plan: RolloutServicePlan = { ...backendPlan, repointBackendKeys: ['yjs', 'mcp'] }
    await activateService(plan, SHA, await fake.rt.readGenerations(), await fake.rt.readLbBackendIds(), fake.rt)
    expect(fake.lbHistory.get('y-bid')?.at(-1)).toEqual(['10.0.0.2'])
    expect(fake.lbHistory.get('m-bid')?.at(-1)).toEqual(['10.0.0.2'])
  })
})
