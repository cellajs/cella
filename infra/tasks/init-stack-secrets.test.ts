import { describe, expect, it } from 'vitest'
import { specs } from './init-stack-secrets.js'

/**
 * Locks the shape of the stack-secret table. Any addition is a deliberate
 * code-review trigger via this test.
 */
describe('init-stack-secrets specs', () => {
  it('snapshot of keys + sources', () => {
    expect(specs.map((s) => ({ key: s.key, from: s.from }))).toEqual([
      { key: 'infra:dbPassword',        from: 'random' },
      { key: 'scaleway:projectId',      from: 'env' },
    ])
  })

  it('every random spec generates at least 24 bytes of entropy', () => {
    for (const spec of specs.filter((s) => s.from === 'random')) {
      if (spec.from !== 'random') continue
      const bytes = spec.bytes ?? 32
      expect(bytes, `${spec.key} entropy`).toBeGreaterThanOrEqual(24)
    }
  })

  it('only scaleway:projectId is stored as a non-secret', () => {
    const nonSecret = specs.filter((s) => s.from === 'env' && s.secret === false).map((s) => s.key)
    expect(nonSecret).toEqual(['scaleway:projectId'])
  })

  it('every secret-shaped key uses the secret writer by default', () => {
    for (const spec of specs) {
      if (spec.from !== 'env') continue
      const isSecretShaped = /(Secret|Password|Token|Key)$/.test(spec.key)
      if (isSecretShaped) {
        // `secret` defaults to true when undefined; explicit `false` is the only escape.
        expect(spec.secret, `${spec.key} must remain secret`).not.toBe(false)
      }
    }
  })
})
