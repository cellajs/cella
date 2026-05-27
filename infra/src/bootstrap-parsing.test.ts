import { describe, expect, it } from 'vitest'
import { detectInterruptedApply, detectStackState, extractApplyMarker, extractProjectId, pickStackShort } from './bootstrap-parsing.js'

describe('detectStackState', () => {
  it('fresh: no yaml at all', () => {
    expect(detectStackState({})).toBe('fresh')
  })

  it('partial: file exists, no scaleway:accessKey yet', () => {
    expect(detectStackState({ yamlText: 'config:\n  scaleway:projectId: abc\n' })).toBe('partial')
  })

  it('bootstrapped: file has a scaleway:accessKey entry', () => {
    expect(detectStackState({ yamlText: 'config:\n  scaleway:accessKey:\n    secure: v1:...' })).toBe('bootstrapped')
  })

  it('does not mistake a comment mentioning scaleway:accessKey for the real key', () => {
    // intentional: scanner is line-substring; we want to acknowledge the false-positive
    // surface in writing rather than silently miss it.
    expect(detectStackState({ yamlText: '# TODO: scaleway:accessKey rotation' })).toBe('bootstrapped')
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

  it('honours a custom candidate list', () => {
    expect(pickStackShort((n) => n === 'qa', ['qa', 'staging'])).toBe('qa')
  })
})

describe('extractProjectId', () => {
  it('reads the plaintext value', () => {
    expect(
      extractProjectId('config:\n  scaleway:projectId: e2e322db-aaaa-bbbb-cccc-ddddeeeeffff\n'),
    ).toBe('e2e322db-aaaa-bbbb-cccc-ddddeeeeffff')
  })

  it('returns undefined when absent', () => {
    expect(extractProjectId('config:\n  scaleway:secretKey:\n    secure: v1:...')).toBeUndefined()
  })
})

describe('extractApplyMarker', () => {
  it('reads the iso timestamp value', () => {
    expect(extractApplyMarker('config:\n  bootstrap:applyInProgress: 2026-05-27T10:00:00.000Z\n')).toBe('2026-05-27T10:00:00.000Z')
  })

  it('trims surrounding whitespace', () => {
    expect(extractApplyMarker('config:\n  bootstrap:applyInProgress:   2026-05-27T10:00:00.000Z   \n')).toBe('2026-05-27T10:00:00.000Z')
  })

  it('returns undefined when absent', () => {
    expect(extractApplyMarker('config:\n  scaleway:projectId: abc\n')).toBeUndefined()
  })
})

describe('detectInterruptedApply', () => {
  const lockPath = '/tmp/.apply-in-progress.production.lock'

  it('clean: no yaml, no lock', () => {
    expect(detectInterruptedApply({ lockExists: false, lockPath })).toBeUndefined()
  })

  it('clean: yaml without marker, no lock', () => {
    expect(detectInterruptedApply({ yamlText: 'config:\n  scaleway:projectId: abc\n', lockExists: false, lockPath })).toBeUndefined()
  })

  it('detects YAML marker (preferred trace)', () => {
    const r = detectInterruptedApply({
      yamlText: 'config:\n  bootstrap:applyInProgress: 2026-05-27T10:00:00.000Z\n',
      lockExists: false,
      lockPath,
    })
    expect(r?.trace).toBe('YAML marker bootstrap:applyInProgress = 2026-05-27T10:00:00.000Z')
  })

  it('detects lock-only', () => {
    const r = detectInterruptedApply({ lockExists: true, lockPath })
    expect(r?.trace).toBe(`Lock file: ${lockPath}`)
  })

  it('YAML marker wins over lock when both present', () => {
    const r = detectInterruptedApply({
      yamlText: 'config:\n  bootstrap:applyInProgress: 2026-05-27T10:00:00.000Z\n',
      lockExists: true,
      lockPath,
    })
    expect(r?.trace).toContain('YAML marker')
  })
})
