import { describe, expect, it } from 'vitest'
import { deriveGenId, GEN_ID_LENGTH } from './gen-id'

describe('deriveGenId', () => {
  it('produces a stable short hex id of the configured length', () => {
    const id = deriveGenId('sha-abc', { image: 'svc:latest' })
    expect(id).toHaveLength(GEN_ID_LENGTH)
    expect(id).toMatch(/^[0-9a-f]+$/)
  })

  it('is deterministic for the same sha + fingerprint (idempotent re-run)', () => {
    const a = deriveGenId('sha-abc', { image: 'svc:latest', env: ['BACKEND_URL', 'FRONTEND_URL'] })
    const b = deriveGenId('sha-abc', { image: 'svc:latest', env: ['BACKEND_URL', 'FRONTEND_URL'] })
    expect(a).toBe(b)
  })

  it('is independent of object key / fingerprint declaration order', () => {
    const a = deriveGenId('sha-abc', { image: 'svc:latest', port: 4000 })
    const b = deriveGenId('sha-abc', { port: 4000, image: 'svc:latest' })
    expect(a).toBe(b)
  })

  it('changes when the release sha changes', () => {
    expect(deriveGenId('sha-abc', { image: 'svc:latest' })).not.toBe(deriveGenId('sha-def', { image: 'svc:latest' }))
  })

  it('changes when any fingerprinted config changes (a config-only roll)', () => {
    const base = deriveGenId('sha-abc', { image: 'svc:latest', bindings: { WS: 'ws://@{backend.privateIp}' } })
    const changed = deriveGenId('sha-abc', { image: 'svc:latest', bindings: { WS: 'ws://@{backend.privateIp}:1234' } })
    expect(base).not.toBe(changed)
  })
})
