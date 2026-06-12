import { describe, expect, it } from 'vitest'
import { enabledServices, services, type ServiceFeatureFlag } from './services'

const allOn: Record<ServiceFeatureFlag, boolean> = { yjs: true, ai: true }
const allOff: Record<ServiceFeatureFlag, boolean> = { yjs: false, ai: false }

describe('service registry — enabledServices', () => {
  it('always includes flag-free services regardless of feature flags', () => {
    const off = enabledServices(allOff).map((s) => s.slug)
    expect(off).toContain('backend')
    expect(off).toContain('cdc')
    expect(off).toContain('frontend')
  })

  it('excludes a service whose featureFlag is off', () => {
    const off = enabledServices(allOff).map((s) => s.slug)
    expect(off).not.toContain('yjs')
    expect(off).not.toContain('ai')
  })

  it('includes a service whose featureFlag is on', () => {
    const on = enabledServices(allOn).map((s) => s.slug)
    expect(on).toContain('yjs')
    expect(on).toContain('ai')
  })

  it('toggles yjs and ai independently', () => {
    const yjsOnly = enabledServices({ yjs: true, ai: false }).map((s) => s.slug)
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

  it('only flag-gated services carry a featureFlag', () => {
    expect(services.find((s) => s.slug === 'yjs')?.featureFlag).toBe('yjs')
    expect(services.find((s) => s.slug === 'ai')?.featureFlag).toBe('ai')
    expect(services.find((s) => s.slug === 'backend')?.featureFlag).toBeUndefined()
  })
})

describe('service registry — instanceType', () => {
  it('sizes backend larger in production than staging (blue-green needs ~2x RAM)', () => {
    const size = services.find((s) => s.slug === 'backend')?.instanceType
    expect(size).toEqual({ production: 'DEV1-M', staging: 'DEV1-S' })
  })

  it('requires a per-service instanceType on every service (DEV1-S for the workers)', () => {
    for (const slug of ['cdc', 'yjs', 'ai', 'frontend'] as const) {
      expect(services.find((s) => s.slug === slug)?.instanceType).toBe('DEV1-S')
    }
  })
})
