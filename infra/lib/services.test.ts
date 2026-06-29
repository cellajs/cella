import { describe, expect, it } from 'vitest'
import { enabledServices, services } from './services'

const allOn = { yjs: { enabled: true }, ai: { enabled: true } }
const allOff = { yjs: { enabled: false }, ai: { enabled: false } }

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
    expect(off).not.toContain('ai')
  })

  it('allows disabling internal-only services without a public URL', () => {
    const withoutCdc = enabledServices({ cdc: { enabled: false } }).map((s) => s.slug)
    expect(withoutCdc).not.toContain('cdc')
  })

  it('includes a service whose appConfig service entry is enabled', () => {
    const on = enabledServices(allOn).map((s) => s.slug)
    expect(on).toContain('yjs')
    expect(on).toContain('ai')
  })

  it('toggles yjs and ai independently', () => {
    const yjsOnly = enabledServices({ yjs: { enabled: true }, ai: { enabled: false } }).map((s) => s.slug)
    expect(yjsOnly).toContain('yjs')
    expect(yjsOnly).not.toContain('ai')
  })
})

describe('service registry — lbRoute invariants', () => {
  it('backend is the default LB backend', () => {
    expect(services.find((s) => s.slug === 'backend')?.lbRoute).toBe('default')
  })

  it('yjs / ai / frontend are host-routed', () => {
    for (const name of ['yjs', 'ai', 'frontend'] as const) {
      expect(services.find((s) => s.slug === name)?.lbRoute).toBe('host')
    }
  })

  it('cdc has no LB route (internal-only)', () => {
    expect(services.find((s) => s.slug === 'cdc')?.lbRoute).toBeUndefined()
  })

  it('keeps appConfig enablement out of the deploy registry', () => {
    expect(services.find((s) => s.slug === 'yjs')).not.toHaveProperty('enabled')
    expect(services.find((s) => s.slug === 'ai')).not.toHaveProperty('enabled')
    expect(services.find((s) => s.slug === 'backend')).not.toHaveProperty('enabled')
  })
})
