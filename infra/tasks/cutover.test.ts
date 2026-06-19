import { describe, expect, it } from 'vitest'
import {
  type CutoverPlan,
  type GetServersFn,
  type SetServersFn,
  contractBackend,
  createLbGetServers,
  createLbSetServers,
  expandBackend,
  pollSlotReleased,
  sequenceCutover,
} from './cutover'

const silent = () => {}
const noSleep = async () => {}

/** Records every server list the LB is set to, in order. */
function recordingSetServers(): { fn: SetServersFn; calls: string[][] } {
  const calls: string[][] = []
  return { fn: async (ips) => void calls.push(ips), calls }
}

const getOldServers: GetServersFn = async () => ['10.0.0.4']

/** A minimal lb-overlap plan with overridable effects. */
function lbPlan(overrides: Partial<CutoverPlan> = {}): CutoverPlan {
  return {
    service: 'backend',
    strategy: 'lb-overlap',
    drainPolicy: 'requests',
    oldIps: ['10.0.0.4'],
    newIps: ['10.0.0.9'],
    drainSeconds: 10,
    healthGate: async () => true,
    setServers: async () => {},
    getServers: getOldServers,
    sleep: noSleep,
    log: silent,
    ...overrides,
  }
}

describe('expandBackend / contractBackend', () => {
  it('expand serves both generations, contract serves only the new', async () => {
    const lb = recordingSetServers()
    await expandBackend(lb.fn, ['10.0.0.4'], ['10.0.0.9'])
    await contractBackend(lb.fn, ['10.0.0.9'])
    expect(lb.calls).toEqual([
      ['10.0.0.4', '10.0.0.9'],
      ['10.0.0.9'],
    ])
  })
})

describe('sequenceCutover — lb-overlap', () => {
  it('expands [old,new] before contracting to [new]', async () => {
    const lb = recordingSetServers()
    const res = await sequenceCutover(lbPlan({ setServers: lb.fn }))
    expect(res.ok).toBe(true)
    expect(lb.calls).toEqual([
      ['10.0.0.4', '10.0.0.9'],
      ['10.0.0.9'],
    ])
  })

  it('health-gates before any LB mutation — an unhealthy new gen aborts with zero LB calls', async () => {
    const lb = recordingSetServers()
    const res = await sequenceCutover(lbPlan({ healthGate: async () => false, setServers: lb.fn }))
    expect(res.ok).toBe(false)
    expect(res.aborted).toBe('unhealthy')
    expect(lb.calls).toEqual([])
    // No expand/contract step was recorded.
    expect(res.steps.some((s) => s.includes('expand'))).toBe(false)
  })

  it('can health-gate after LB expansion for CI-visible public probes', async () => {
    const order: string[] = []
    const res = await sequenceCutover(
      lbPlan({
        healthAfterExpand: true,
        setServers: async (ips) => void order.push(ips.length === 2 ? 'expand' : 'contract'),
        healthGate: async () => {
          order.push('health')
          return true
        },
      }),
    )
    expect(res.ok).toBe(true)
    expect(order).toEqual(['expand', 'health', 'contract'])
  })

  it('orders the steps health → expand → reattach → health → contract → drain', async () => {
    const order: string[] = []
    const res = await sequenceCutover(
      lbPlan({
        healthGate: async () => {
          order.push('health')
          return true
        },
        setServers: async (ips) => void order.push(ips.length === 2 ? 'expand' : 'contract'),
        reattachInternalIp: async () => void order.push('reattach'),
        sleep: async () => void order.push('drain'),
      }),
    )
    expect(res.ok).toBe(true)
    expect(order).toEqual(['health', 'expand', 'reattach', 'health', 'contract', 'drain'])
  })

  it('aborts after stable IP reattach without contracting when the new generation stops serving', async () => {
    const order: string[] = []
    let healthChecks = 0
    const res = await sequenceCutover(
      lbPlan({
        healthGate: async () => {
          order.push('health')
          healthChecks += 1
          return healthChecks === 1
        },
        setServers: async (ips) => void order.push(ips.length === 2 ? 'expand' : 'contract'),
        reattachInternalIp: async () => void order.push('reattach'),
      }),
    )
    expect(res.ok).toBe(false)
    expect(res.aborted).toBe('unhealthy')
    expect(order).toEqual(['health', 'expand', 'reattach', 'health'])
  })

  it('resumes when the LB is already expanded to [old,new]', async () => {
    const lb = recordingSetServers()
    const res = await sequenceCutover(lbPlan({ getServers: async () => ['10.0.0.9', '10.0.0.4'], setServers: lb.fn }))
    expect(res.ok).toBe(true)
    expect(lb.calls).toEqual([['10.0.0.9']])
    expect(res.steps).toContain('LB already expanded to [old, new]')
  })

  it('is a no-op success when the LB is already contracted to [new]', async () => {
    const lb = recordingSetServers()
    const res = await sequenceCutover(lbPlan({ getServers: async () => ['10.0.0.9'], setServers: lb.fn }))
    expect(res.ok).toBe(true)
    expect(lb.calls).toEqual([])
    expect(res.steps).toContain('LB already contracted to [new]')
  })

  it('aborts before mutation on an unexpected current LB server list', async () => {
    const lb = recordingSetServers()
    const res = await sequenceCutover(lbPlan({ getServers: async () => ['10.0.0.99'], setServers: lb.fn }))
    expect(res.ok).toBe(false)
    expect(res.aborted).toBe('unexpected-lb-state')
    expect(lb.calls).toEqual([])
  })

  it('falls back to Pulumi oldIps when the LB read returns an empty server list', async () => {
    const lb = recordingSetServers()
    const res = await sequenceCutover(lbPlan({ getServers: async () => [], setServers: lb.fn }))
    expect(res.ok).toBe(true)
    expect(lb.calls).toEqual([
      ['10.0.0.4', '10.0.0.9'],
      ['10.0.0.9'],
    ])
    expect(res.steps).toContain('LB server list probe returned empty; assuming [old] from Pulumi metadata')
  })

  it('drain wait happens after contract (old is removed before we wait for it to drain)', async () => {
    const order: string[] = []
    await sequenceCutover(
      lbPlan({
        setServers: async (ips) => void order.push(ips.length === 2 ? 'expand' : 'contract'),
        sleep: async () => void order.push('drain'),
      }),
    )
    expect(order.indexOf('contract')).toBeLessThan(order.indexOf('drain'))
  })

  it('skips the drain sleep when drainSeconds is 0', async () => {
    let slept = false
    await sequenceCutover(lbPlan({ drainSeconds: 0, sleep: async () => void (slept = true) }))
    expect(slept).toBe(false)
  })

  it('throws if a lb-overlap plan has no setServers effect', async () => {
    await expect(sequenceCutover(lbPlan({ setServers: undefined }))).rejects.toThrow(/requires a setServers effect/)
  })
})

describe('sequenceCutover — exclusive (cdc)', () => {
  it('never expands an LB backend, drains old, then signals new-active', async () => {
    const lb = recordingSetServers()
    const order: string[] = []
    const res = await sequenceCutover({
      service: 'cdc',
      strategy: 'exclusive',
      oldIps: [],
      newIps: [],
      drainSeconds: 0,
      healthGate: async () => {
        order.push('health')
        return true
      },
      setServers: lb.fn,
      drainOldGeneration: async () => void order.push('drain-old'),
      isSlotActive: async () => {
        order.push('slot-check')
        return false
      },
      sleep: noSleep,
      log: silent,
    })
    expect(res.ok).toBe(true)
    expect(lb.calls).toEqual([]) // the LB is never touched for an exclusive service
    expect(order).toEqual(['health', 'drain-old', 'slot-check'])
  })

  it('aborts (slot-stuck) when the old consumer never releases the slot', async () => {
    const res = await sequenceCutover({
      service: 'cdc',
      strategy: 'exclusive',
      oldIps: [],
      newIps: [],
      drainSeconds: 0,
      healthGate: async () => true,
      drainOldGeneration: async () => {},
      isSlotActive: async () => true, // always held
      sleep: noSleep,
      log: silent,
    })
    expect(res.ok).toBe(false)
    expect(res.aborted).toBe('slot-stuck')
  })

  it('aborts (unhealthy) before draining the old generation', async () => {
    let drained = false
    const res = await sequenceCutover({
      service: 'cdc',
      strategy: 'exclusive',
      oldIps: [],
      newIps: [],
      drainSeconds: 0,
      healthGate: async () => false,
      drainOldGeneration: async () => void (drained = true),
      sleep: noSleep,
      log: silent,
    })
    expect(res.ok).toBe(false)
    expect(res.aborted).toBe('unhealthy')
    expect(drained).toBe(false)
  })
})

describe('pollSlotReleased', () => {
  it('returns true as soon as the slot is inactive', async () => {
    let calls = 0
    const released = await pollSlotReleased({
      isSlotActive: async () => {
        calls += 1
        return calls < 3 // active for the first two checks, released on the third
      },
      intervalMs: 1,
      sleep: noSleep,
      log: silent,
    })
    expect(released).toBe(true)
    expect(calls).toBe(3)
  })

  it('returns false when the budget is exhausted while still active', async () => {
    const released = await pollSlotReleased({
      isSlotActive: async () => true,
      attempts: 4,
      intervalMs: 1,
      sleep: noSleep,
      log: silent,
    })
    expect(released).toBe(false)
  })
})

describe('createLbSetServers — live REST shape', () => {
  it('PUTs the full server list as { server_ip } to the zoned backend servers endpoint', async () => {
    let captured: { url: string; method?: string; headers?: Record<string, string>; body?: string } | undefined
    const setServers = createLbSetServers({
      secretKey: 'scw-secret',
      zone: 'fr-par-1',
      backendId: 'be-123',
      fetchImpl: async (url, init) => {
        captured = { url, ...init }
        return { ok: true, status: 200, text: async () => '' }
      },
    })
    await setServers(['10.0.0.4', '10.0.0.9'])
    expect(captured?.url).toBe('https://api.scaleway.com/lb/v1/zones/fr-par-1/backends/be-123/servers')
    expect(captured?.method).toBe('PUT')
    expect(captured?.headers?.['X-Auth-Token']).toBe('scw-secret')
    expect(JSON.parse(captured?.body ?? '{}')).toEqual({ server_ip: ['10.0.0.4', '10.0.0.9'] })
  })

  it('strips the zone prefix from Pulumi zoned backend IDs', async () => {
    let capturedUrl = ''
    const setServers = createLbSetServers({
      secretKey: 'scw-secret',
      zone: 'nl-ams-1',
      backendId: 'nl-ams-1/be-123',
      fetchImpl: async (url) => {
        capturedUrl = url
        return { ok: true, status: 200, text: async () => '' }
      },
    })
    await setServers(['10.0.0.4'])
    expect(capturedUrl).toBe('https://api.scaleway.com/lb/v1/zones/nl-ams-1/backends/be-123/servers')
  })

  it('throws with the status and body on a non-ok response', async () => {
    const setServers = createLbSetServers({
      secretKey: 'k',
      zone: 'fr-par-1',
      backendId: 'be-err',
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'denied' }),
    })
    await expect(setServers(['10.0.0.1'])).rejects.toThrow(/be-err → 403: denied/)
  })
})

describe('createLbGetServers — live REST shape', () => {
  it('GETs the backend and parses the server list from flexible Scaleway response shapes', async () => {
    let capturedUrl = ''
    const getServers = createLbGetServers({
      secretKey: 'scw-secret',
      zone: 'fr-par-1',
      backendId: 'be-123',
      fetchImpl: async (url) => {
        capturedUrl = url
        return { ok: true, status: 200, text: async () => JSON.stringify({ servers: [{ ip: '10.0.0.4' }, { server_ip: '10.0.0.9' }] }) }
      },
    })
    await expect(getServers()).resolves.toEqual(['10.0.0.4', '10.0.0.9'])
    expect(capturedUrl).toBe('https://api.scaleway.com/lb/v1/zones/fr-par-1/backends/be-123')
  })

  it('parses wrapped backend payloads from Scaleway', async () => {
    const getServers = createLbGetServers({
      secretKey: 'scw-secret',
      zone: 'fr-par-1',
      backendId: 'be-123',
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ backend: { server_ip: ['10.0.0.4'] } }) }),
    })
    await expect(getServers()).resolves.toEqual(['10.0.0.4'])
  })

  it('parses provider-style serverIps payloads', async () => {
    const getServers = createLbGetServers({
      secretKey: 'scw-secret',
      zone: 'fr-par-1',
      backendId: 'be-123',
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ backend: { serverIps: ['10.0.0.4'] } }) }),
    })
    await expect(getServers()).resolves.toEqual(['10.0.0.4'])
  })

  it('strips the zone prefix before reading the backend', async () => {
    let capturedUrl = ''
    const getServers = createLbGetServers({
      secretKey: 'scw-secret',
      zone: 'nl-ams-1',
      backendId: 'nl-ams-1/be-123',
      fetchImpl: async (url) => {
        capturedUrl = url
        return { ok: true, status: 200, text: async () => JSON.stringify({ server_ip: ['10.0.0.4'] }) }
      },
    })
    await expect(getServers()).resolves.toEqual(['10.0.0.4'])
    expect(capturedUrl).toBe('https://api.scaleway.com/lb/v1/zones/nl-ams-1/backends/be-123')
  })
})
