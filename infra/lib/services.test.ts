import { describe, expect, it } from 'vitest'
import { coHostedServices, deployedServices, enabledServices, services } from './services'

const allOn = { yjs: { enabled: true }, mcp: { enabled: true } }
const allOff = { yjs: { enabled: false }, mcp: { enabled: false } }

describe('service registry — enabledServices', () => {
  it('includes services that do not opt out in appConfig.services', () => {
    const off = enabledServices(allOff).map((s) => s.slug)
    expect(off).toContain('backend')
    expect(off).toContain('cdc')
    expect(off).toContain('frontend')
  })

  it('excludes a service whose appConfig service entry is disabled', () => {
    const off = enabledServices(allOff).map((s) => s.slug)
    expect(off).not.toContain('yjs')
    expect(off).not.toContain('mcp')
  })

  it('allows disabling internal-only services without a public URL', () => {
    const withoutCdc = enabledServices({ cdc: { enabled: false } }).map((s) => s.slug)
    expect(withoutCdc).not.toContain('cdc')
  })

  it('includes a service whose appConfig service entry is enabled', () => {
    const on = enabledServices(allOn).map((s) => s.slug)
    expect(on).toContain('yjs')
    expect(on).toContain('mcp')
  })

  it('toggles yjs and mcp independently', () => {
    const yjsOnly = enabledServices({ yjs: { enabled: true }, mcp: { enabled: false } }).map((s) => s.slug)
    expect(yjsOnly).toContain('yjs')
    expect(yjsOnly).not.toContain('mcp')
  })
})

describe('service registry — singleVM (deployedServices / coHostedServices)', () => {
  it('split-VM (singleVM off) deploys every enabled service on its own VM', () => {
    const deployed = deployedServices(allOn, false).map((s) => s.slug)
    expect(deployed).toEqual(enabledServices(allOn).map((s) => s.slug))
    expect(deployed).toContain('cdc')
    expect(deployed).toContain('yjs')
    expect(deployed).toContain('mcp')
  })

  it('singleVM folds co-hosted workers off their own VM but keeps the host + SPA proxy', () => {
    const deployed = deployedServices(allOn, true).map((s) => s.slug)
    expect(deployed).toContain('backend')
    expect(deployed).toContain('frontend')
    expect(deployed).not.toContain('cdc')
    expect(deployed).not.toContain('yjs')
    expect(deployed).not.toContain('mcp')
  })

  it('coHostedServices lists only enabled co-hosted workers, and only under singleVM', () => {
    expect(coHostedServices(allOn, false)).toEqual([])
    const folded = coHostedServices(allOn, true).map((s) => s.slug)
    expect(folded).toContain('cdc')
    expect(folded).toContain('yjs')
    expect(folded).toContain('mcp')
    expect(folded).not.toContain('backend')
    expect(folded).not.toContain('frontend')
  })

  it('a disabled co-hosted worker is neither deployed nor folded under singleVM', () => {
    const cfg = { yjs: { enabled: false }, mcp: { enabled: true } }
    expect(coHostedServices(cfg, true).map((s) => s.slug)).not.toContain('yjs')
    expect(deployedServices(cfg, true).map((s) => s.slug)).not.toContain('yjs')
  })
})

describe('service registry — lbRoute contract', () => {
  it('frontend (the app origin) is the default LB backend', () => {
    expect(services.find((s) => s.slug === 'frontend')?.lbRoute).toBe('default')
  })

  it('backend / yjs / mcp are path-routed (same-origin model)', () => {
    for (const name of ['backend', 'yjs', 'mcp'] as const) {
      expect(services.find((s) => s.slug === name)?.lbRoute).toBe('path')
    }
  })

  it('cdc has no LB route (internal-only)', () => {
    expect(services.find((s) => s.slug === 'cdc')?.lbRoute).toBeUndefined()
  })

  it('keeps appConfig enablement out of the deploy registry', () => {
    expect(services.find((s) => s.slug === 'yjs')).not.toHaveProperty('enabled')
    expect(services.find((s) => s.slug === 'mcp')).not.toHaveProperty('enabled')
    expect(services.find((s) => s.slug === 'backend')).not.toHaveProperty('enabled')
  })
})
