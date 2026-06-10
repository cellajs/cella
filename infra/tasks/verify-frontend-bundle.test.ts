import { describe, expect, it, vi } from 'vitest'
import {
  classifyError,
  extractEntryAsset,
  parseArgs,
  type ProbeResult,
  servedMatches,
  verifyBundle,
} from './verify-frontend-bundle'

const HTML = '<!doctype html><html><head><script type="module" src="/assets/index-abc123.js"></script></head></html>'

describe('extractEntryAsset', () => {
  it('extracts the hashed entry script src', () => {
    expect(extractEntryAsset(HTML)).toBe('/assets/index-abc123.js')
  })

  it('returns undefined when there is no asset reference', () => {
    expect(extractEntryAsset('<html><body>no scripts</body></html>')).toBeUndefined()
  })

  it('takes the first asset script when several are present', () => {
    const html = '<script src="/assets/index-aaa.js"></script><script src="/assets/vendor-bbb.js"></script>'
    expect(extractEntryAsset(html)).toBe('/assets/index-aaa.js')
  })
})

describe('servedMatches', () => {
  it('matches when served HTML references the expected asset', () => {
    expect(servedMatches(HTML, '/assets/index-abc123.js')).toBe(true)
  })

  it('does not match a stale asset reference', () => {
    expect(servedMatches(HTML, '/assets/index-OLD.js')).toBe(false)
  })

  it('accepts any body when no expected asset is known', () => {
    expect(servedMatches('anything', undefined)).toBe(true)
  })
})

describe('classifyError', () => {
  it('classifies a TLS cause code as tls', () => {
    expect(classifyError({ cause: { code: 'CERT_HAS_EXPIRED' } })).toEqual({ kind: 'tls', detail: 'CERT_HAS_EXPIRED' })
  })

  it('classifies a top-level TLS code as tls', () => {
    expect(classifyError({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' })).toEqual({ kind: 'tls', detail: 'ERR_TLS_CERT_ALTNAME_INVALID' })
  })

  it('classifies a non-TLS error as generic', () => {
    expect(classifyError({ cause: { code: 'ECONNREFUSED' } })).toEqual({ kind: 'error', detail: 'ECONNREFUSED' })
  })

  it('falls back to the error message when no code is present', () => {
    expect(classifyError(new Error('boom'))).toEqual({ kind: 'error', detail: 'boom' })
  })
})

describe('verifyBundle', () => {
  const noSleep = vi.fn(async () => {})
  const noLog = () => {}
  const ok = (body: string): ProbeResult => ({ kind: 'ok', body })

  it('succeeds when the served bundle references the expected asset', async () => {
    const probe = vi.fn(async () => ok(HTML))
    const out = await verifyBundle({ url: 'https://app', expectedAsset: '/assets/index-abc123.js', probe, sleep: noSleep, log: noLog })
    expect(out).toEqual({ ok: true, attempts: 1 })
  })

  it('retries while a stale bundle is served, then succeeds', async () => {
    const bodies = ['<script src="/assets/index-OLD.js"></script>', HTML]
    let i = 0
    const probe = vi.fn(async () => ok(bodies[i++]))
    const out = await verifyBundle({ url: 'https://app', expectedAsset: '/assets/index-abc123.js', probe, attempts: 5, sleep: noSleep, log: noLog })
    expect(out).toEqual({ ok: true, attempts: 2 })
  })

  it('fails fast on a TLS error without exhausting attempts', async () => {
    const probe = vi.fn(async (): Promise<ProbeResult> => ({ kind: 'tls', detail: 'CERT_HAS_EXPIRED' }))
    const out = await verifyBundle({ url: 'https://app', expectedAsset: '/assets/index-abc123.js', probe, attempts: 10, sleep: noSleep, log: noLog })
    expect(out).toEqual({ ok: false, reason: 'tls', detail: 'CERT_HAS_EXPIRED' })
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('times out after exhausting attempts on persistent staleness', async () => {
    const probe = vi.fn(async () => ok('<script src="/assets/index-OLD.js"></script>'))
    const out = await verifyBundle({ url: 'https://app', expectedAsset: '/assets/index-abc123.js', probe, attempts: 3, sleep: noSleep, log: noLog })
    expect(out).toEqual({ ok: false, reason: 'timeout' })
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('accepts any successful body when expectedAsset is unknown', async () => {
    const probe = vi.fn(async () => ok('whatever'))
    const out = await verifyBundle({ url: 'https://app', expectedAsset: undefined, probe, sleep: noSleep, log: noLog })
    expect(out).toEqual({ ok: true, attempts: 1 })
  })
})

describe('parseArgs', () => {
  it('parses url and applies defaults', () => {
    expect(parseArgs(['--url', 'https://app'])).toEqual({
      url: 'https://app',
      dist: 'dist/index.html',
      attempts: 30,
      intervalMs: 3000,
      timeoutMs: 8000,
    })
  })

  it('throws when --url is missing', () => {
    expect(() => parseArgs([])).toThrow(/Usage/)
  })
})
