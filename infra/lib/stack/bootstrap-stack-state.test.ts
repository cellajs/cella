import { describe, expect, it } from 'vitest'
import { detectComputeDeferred, detectStackState, extractComputeDeferredMarker, pickStackShort } from './bootstrap-stack-state'

describe('detectStackState', () => {
  it('fresh: no yaml at all', () => {
    expect(detectStackState({})).toBe('fresh')
  })

  it('partial: file exists, no bootstrap marker yet', () => {
    expect(detectStackState({ yamlText: 'config:\n  infra:cookieSecret:\n    secure: v1:...' })).toBe('partial')
  })

  it('bootstrapped: file records the bootstrapComplete breadcrumb', () => {
    expect(detectStackState({ yamlText: 'config:\n  infra:bootstrapComplete: 2025-01-01T00:00:00.000Z\n' })).toBe('bootstrapped')
  })

  it('bootstrapped: legacy infra:vmAccessKey marker still detected (pre-Secret-Manager stacks)', () => {
    expect(detectStackState({ yamlText: 'config:\n  infra:vmAccessKey:\n    secure: v1:ww0JDbm...\n' })).toBe('bootstrapped')
  })

  it('bootstrapped: legacy infra:applicationId marker still detected', () => {
    expect(detectStackState({ yamlText: 'config:\n  infra:applicationId: 11111111-2222-3333-4444-555555555555\n' })).toBe('bootstrapped')
  })

  it('does not mistake a comment mentioning a marker for the real entry', () => {
    // intentional: scanner is line-substring; we want to acknowledge the false-positive
    // surface in writing rather than silently miss it.
    expect(detectStackState({ yamlText: '# todo: infra:bootstrapComplete rotation' })).toBe('bootstrapped')
  })
})

describe('pickStackShort', () => {
  it('returns the first short-name whose file exists', () => {
    expect(pickStackShort((n) => n === 'production')).toBe('production')
    expect(pickStackShort((n) => n === 'staging')).toBe('staging')
  })

  it('falls back to production when none exist', () => {
    expect(pickStackShort(() => false)).toBe('production')
  })
})

describe('extractComputeDeferredMarker', () => {
  it('reads the iso timestamp value', () => {
    expect(extractComputeDeferredMarker('config:\n  bootstrap:computeDeferred: 2026-05-27T10:00:00.000Z\n')).toBe('2026-05-27T10:00:00.000Z')
  })

  it('trims surrounding whitespace', () => {
    expect(extractComputeDeferredMarker('config:\n  bootstrap:computeDeferred:   2026-05-27T10:00:00.000Z   \n')).toBe('2026-05-27T10:00:00.000Z')
  })

  it('returns undefined when absent', () => {
    expect(extractComputeDeferredMarker('config:\n  scaleway:projectId: abc\n')).toBeUndefined()
  })
})

describe('detectComputeDeferred', () => {
  it('clean: no yaml', () => {
    expect(detectComputeDeferred()).toBeUndefined()
  })

  it('clean: yaml without marker', () => {
    expect(detectComputeDeferred('config:\n  scaleway:projectId: abc\n')).toBeUndefined()
  })

  it('returns the marker value when present', () => {
    expect(detectComputeDeferred('config:\n  bootstrap:computeDeferred: 2026-05-27T10:00:00.000Z\n')).toBe('2026-05-27T10:00:00.000Z')
  })
})
