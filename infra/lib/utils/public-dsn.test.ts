import { describe, expect, it } from 'vitest'
import { hardenPublicDsn } from './public-dsn'

describe('hardenPublicDsn', () => {
  it('upgrades sslmode to verify-full, pins the CA, and drops uselibpqcompat', () => {
    const dsn = 'postgresql://admin:pw@lb.example.scw.cloud:20184/appdb?sslmode=require&uselibpqcompat=true'
    const out = hardenPublicDsn(dsn, '/tmp/ca.pem')
    const [base, query] = out.split('?')
    expect(base).toBe('postgresql://admin:pw@lb.example.scw.cloud:20184/appdb')
    const params = new URLSearchParams(query)
    expect(params.get('sslmode')).toBe('verify-full')
    expect(params.get('sslrootcert')).toBe('/tmp/ca.pem')
    expect(params.has('uselibpqcompat')).toBe(false)
  })

  it('leaves percent-encoded userinfo untouched', () => {
    const dsn = 'postgresql://admin:p%40ss%2Fword@host:5432/db?sslmode=require'
    const out = hardenPublicDsn(dsn, '/tmp/ca.pem')
    expect(out.startsWith('postgresql://admin:p%40ss%2Fword@host:5432/db?')).toBe(true)
  })

  it('handles a DSN with no query string', () => {
    const out = hardenPublicDsn('postgresql://admin:pw@host:5432/db', '/tmp/ca.pem')
    const params = new URLSearchParams(out.split('?')[1])
    expect(params.get('sslmode')).toBe('verify-full')
  })
})
