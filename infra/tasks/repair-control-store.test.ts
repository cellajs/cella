import { describe, expect, it } from 'vitest'
import { parseControlState } from '../lib/stack/control-store'
import { repairControlDocument } from './repair-control-store'

describe('repairControlDocument', () => {
  it('reports absent when the object does not exist', () => {
    expect(repairControlDocument(undefined)).toEqual({ action: 'absent' })
    expect(repairControlDocument('')).toEqual({ action: 'absent' })
  })

  it('leaves a well-formed document untouched', () => {
    const doc = JSON.stringify({
      schemaVersion: 2,
      bootstrap: {},
      rollout: { backend: { seq: 5, active: { id: 'aa11', sha: 'abc', seq: 5 }, pendingSha: 'def' } },
    })
    expect(repairControlDocument(doc)).toEqual({ action: 'healthy' })
    expect(repairControlDocument('{"schemaVersion":2,"bootstrap":{},"rollout":{}}')).toEqual({ action: 'healthy' })
  })

  it('drops a pointer that lacks an id', () => {
    // The exact corruption a pre-fix sync-rollout-config wrote: active without id.
    const corrupt = JSON.stringify({
      schemaVersion: 2,
      bootstrap: {},
      rollout: { backend: { seq: 274, pendingSha: '9fe4', active: { sha: '9fe4', seq: 274 } } },
    })
    const result = repairControlDocument(corrupt)
    expect(result.action).toBe('repaired')
    if (result.action !== 'repaired') return
    expect(result.state.rollout.backend).toEqual({ seq: 274, pendingSha: '9fe4' })
  })

  it('strips an obsolete previous pointer and preserves bootstrap', () => {
    const stale = JSON.stringify({
      schemaVersion: 2,
      bootstrap: { completedAt: '2026-06-20T00:00:00Z' },
      rollout: { yjs: { seq: 3, active: { id: 'bb22', sha: 'abc', seq: 3 }, previous: { id: 'aa11', sha: 'old', seq: 2 } } },
    })
    const result = repairControlDocument(stale)
    expect(result.action).toBe('repaired')
    if (result.action !== 'repaired') return
    expect(result.state.rollout.yjs).toEqual({ seq: 3, active: { id: 'bb22', sha: 'abc', seq: 3 } })
    expect(result.state.bootstrap).toEqual({ completedAt: '2026-06-20T00:00:00Z' })
  })

  it('throws on an unrecognised schema version', () => {
    expect(() => repairControlDocument('{"schemaVersion":1}')).toThrow(/cannot repair schemaVersion 1/)
    expect(() => repairControlDocument('{"schemaVersion":3}')).toThrow(/cannot repair schemaVersion 3/)
  })

  it('produces a document the parser accepts', () => {
    const corrupt = JSON.stringify({ schemaVersion: 2, rollout: { backend: { seq: 5, active: { sha: 'abc', seq: 5 } } } })
    const result = repairControlDocument(corrupt)
    if (result.action !== 'repaired') throw new Error('expected repaired')
    // Round-trips through the real validator without throwing.
    expect(() => parseControlState(`${JSON.stringify(result.state)}\n`)).not.toThrow()
  })
})
