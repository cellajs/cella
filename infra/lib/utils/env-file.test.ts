import { describe, expect, it } from 'vitest'
import { isEnvFileDeliverable } from './env-file'

describe('isEnvFileDeliverable', () => {
  it('accepts a single-line value', () => {
    expect(isEnvFileDeliverable('postgres://user:pass@host:5432/db')).toEqual({ ok: true })
    // base64 of a multi-line PEM is single-line and therefore deliverable.
    expect(isEnvFileDeliverable('LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t')).toEqual({ ok: true })
  })

  it('rejects a value containing a newline (raw multi-line PEM)', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----'
    expect(isEnvFileDeliverable(pem)).toEqual({ ok: false, reason: 'multiline' })
  })

  it('rejects a value containing a carriage return', () => {
    expect(isEnvFileDeliverable('value\rmore')).toEqual({ ok: false, reason: 'multiline' })
  })

  it('rejects an empty value', () => {
    expect(isEnvFileDeliverable('')).toEqual({ ok: false, reason: 'empty' })
  })
})
