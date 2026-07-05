import { describe, expect, it } from 'vitest'
import { maskSecret } from './masked-secret'

describe('maskSecret', () => {
  it('reveals only the ends of a long value', () => {
    expect(maskSecret('SCWXXXXXXXXXXXXXXXXX', 3)).toBe(`SCW${'•'.repeat(14)}XXX`)
  })

  it('fully masks values too short to keep more hidden than revealed', () => {
    // Below revealEnds * 3 the ends would expose most of the value.
    expect(maskSecret('12345678', 3)).toBe('•'.repeat(8))
    expect(maskSecret('123456789', 3)).toBe(`123${'•'.repeat(3)}789`)
  })

  it('returns an empty string for an empty value', () => {
    expect(maskSecret('', 3)).toBe('')
  })
})
