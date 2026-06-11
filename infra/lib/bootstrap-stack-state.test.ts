import { describe, expect, it } from 'vitest'
import { detectInterruptedApply, detectStackState, extractApplyMarker, extractProjectId, pickStackShort } from './bootstrap-stack-state'

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
    expect(detectStackState({ yamlText: '# TODO: infra:bootstrapComplete rotation' })).toBe('bootstrapped')
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
  const backupPath = '/tmp/Pulumi.production.yaml.apply-backup'

  it('clean: no yaml, no backup', () => {
    expect(detectInterruptedApply({ backupExists: false, backupPath })).toBeUndefined()
  })

  it('clean: yaml without marker, no backup', () => {
    expect(detectInterruptedApply({ yamlText: 'config:\n  scaleway:projectId: abc\n', backupExists: false, backupPath })).toBeUndefined()
  })

  it('detects YAML marker when no backup present', () => {
    const r = detectInterruptedApply({
      yamlText: 'config:\n  bootstrap:applyInProgress: 2026-05-27T10:00:00.000Z\n',
      backupExists: false,
      backupPath,
    })
    expect(r?.trace).toBe('YAML marker bootstrap:applyInProgress = 2026-05-27T10:00:00.000Z')
  })

  it('detects backup-only', () => {
    const r = detectInterruptedApply({ backupExists: true, backupPath })
    expect(r?.trace).toBe(`Backup file: ${backupPath}`)
  })

  it('backup file wins over YAML marker when both present', () => {
    const r = detectInterruptedApply({
      yamlText: 'config:\n  bootstrap:applyInProgress: 2026-05-27T10:00:00.000Z\n',
      backupExists: true,
      backupPath,
    })
    expect(r?.trace).toContain('Backup file')
  })
})
