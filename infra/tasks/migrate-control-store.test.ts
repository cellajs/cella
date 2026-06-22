import { describe, expect, it } from 'vitest'
import { parseControlState } from '../lib/control-store'
import { migrateControlDocument } from './migrate-control-store'

describe('migrateControlDocument', () => {
  it('reports absent when the object does not exist', () => {
    expect(migrateControlDocument(undefined)).toEqual({ action: 'absent' })
    expect(migrateControlDocument('')).toEqual({ action: 'absent' })
  })

  it('is a no-op when already schemaVersion 2', () => {
    expect(migrateControlDocument('{"schemaVersion":2,"bootstrap":{},"rollout":{}}')).toEqual({ action: 'already-v2' })
  })

  it('leaves a well-formed v2 document untouched', () => {
    const v2 = JSON.stringify({
      schemaVersion: 2,
      bootstrap: {},
      rollout: { backend: { seq: 5, active: { id: 'aa11', sha: 'abc', seq: 5 }, pendingSha: 'def' } },
    })
    expect(migrateControlDocument(v2)).toEqual({ action: 'already-v2' })
  })

  it('repairs a malformed v2 by dropping a pointer that lacks an id', () => {
    // The exact corruption a pre-fix sync-rollout-config wrote: active without id.
    const corrupt = JSON.stringify({
      schemaVersion: 2,
      bootstrap: {},
      rollout: { backend: { seq: 274, pendingSha: '9fe4', active: { sha: '9fe4', seq: 274 } } },
    })
    const result = migrateControlDocument(corrupt)
    expect(result.action).toBe('migrated')
    if (result.action !== 'migrated') return
    expect(result.state.rollout.backend).toEqual({ seq: 274, pendingSha: '9fe4' })
  })

  it('throws on an unrecognised schema version', () => {
    expect(() => migrateControlDocument('{"schemaVersion":3}')).toThrow(/cannot migrate schemaVersion 3/)
  })

  it('carries each service current sha forward as pendingSha and gen as seq', () => {
    const v1 = JSON.stringify({
      schemaVersion: 1,
      bootstrap: { completedAt: '2026-06-20T00:00:00Z' },
      rollout: {
        backend: { gen: 312, sha: 'abc123', pendingGen: 313, pendingSha: 'def456' },
        cdc: { gen: 12, sha: 'abc123' },
      },
    })
    const result = migrateControlDocument(v1)
    expect(result.action).toBe('migrated')
    if (result.action !== 'migrated') return
    expect(result.state.rollout).toEqual({
      backend: { seq: 312, pendingSha: 'abc123' },
      cdc: { seq: 12, pendingSha: 'abc123' },
    })
    // bootstrap is preserved.
    expect(result.state.bootstrap).toEqual({ completedAt: '2026-06-20T00:00:00Z' })
  })

  it('drops a latest placeholder sha so the service falls back to first-provision', () => {
    const v1 = JSON.stringify({ schemaVersion: 1, rollout: { yjs: { gen: 1, sha: 'latest' } } })
    const result = migrateControlDocument(v1)
    if (result.action !== 'migrated') throw new Error('expected migrated')
    expect(result.state.rollout.yjs).toEqual({ seq: 1 })
  })

  it('produces a document the v2 parser accepts', () => {
    const v1 = JSON.stringify({ schemaVersion: 1, rollout: { backend: { gen: 5, sha: 'abc' } } })
    const result = migrateControlDocument(v1)
    if (result.action !== 'migrated') throw new Error('expected migrated')
    // Round-trips through the real validator without throwing.
    expect(() => parseControlState(`${JSON.stringify(result.state)}\n`)).not.toThrow()
  })
})
