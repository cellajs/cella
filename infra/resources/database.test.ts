import { beforeAll, describe, expect, it } from 'vitest'
import { installPulumiMocks } from '../tests/helpers/pulumi-mock'

// database.ts creates Scaleway resources at import time, so prime the Pulumi
// runtime mocks before importing it. We only exercise the pure DSN formatter.
let formatPostgresUrl: (user: string, pass: string, host: string, port: number | string, database: string) => string

beforeAll(async () => {
  // `bootstrap:applyInProgress` disables the compute pin-guard so the module
  // imports without requiring pinned image tags.
  await installPulumiMocks({ stack: 'production', config: { 'bootstrap:applyInProgress': 'test' } })
  ;({ formatPostgresUrl } = await import('./database'))
})

describe('formatPostgresUrl', () => {
  it('assembles a DSN with host, port and database in place', () => {
    expect(formatPostgresUrl('admin', 'pw', 'db.internal', 5432, 'app')).toBe(
      'postgresql://admin:pw@db.internal:5432/app?sslmode=require&uselibpqcompat=true',
    )
  })

  it('always pins sslmode=require and uselibpqcompat=true', () => {
    const url = formatPostgresUrl('u', 'p', 'h', 1234, 'd')
    expect(url).toContain('?sslmode=require&uselibpqcompat=true')
  })

  it('accepts a string port', () => {
    expect(formatPostgresUrl('u', 'p', 'h', '6432', 'd')).toContain('@h:6432/d')
  })

  it('percent-encodes credentials that contain URI metacharacters', () => {
    const url = formatPostgresUrl('user@org', 'p@ss:w/rd?#&', 'h', 5432, 'd')
    expect(url).toBe('postgresql://user%40org:p%40ss%3Aw%2Frd%3F%23%26@h:5432/d?sslmode=require&uselibpqcompat=true')
  })

  it('keeps a password with @ and : from breaking out of the userinfo segment', () => {
    // Authority must split into exactly userinfo + host:port — the encoded
    // password cannot inject a second `@` or `:` that re-parses the host.
    const url = formatPostgresUrl('u', 'p@ss:bad@host', 'real-host', 5432, 'd')
    const authority = url.slice('postgresql://'.length, url.indexOf('/d?'))
    const [userinfo, hostport] = authority.split('@')
    expect(hostport).toBe('real-host:5432')
    expect(userinfo).toBe('u:p%40ss%3Abad%40host')
  })
})
