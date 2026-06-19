import { describe, expect, it, vi } from 'vitest'
import {
  type ComponentIssue,
  formatComponentIssues,
  hasHashedAsset,
  type HttpResponse,
  isHtmlDocument,
  missingSecurityHeaders,
  parseArgs,
  runSmoke,
  SECURITY_HEADERS,
  unhealthyComponents,
} from './smoke'

const SHA = 'abc1234'

const HASHED_HTML = '<!doctype html><html><head><script type="module" src="/assets/index-abc123.js"></script></head><body></body></html>'

/** A /health?depth=full body where every component is healthy. */
const HEALTHY_COMPONENTS = JSON.stringify({
  status: 'healthy',
  components: { api: { status: 'healthy' }, database: { status: 'healthy' }, cdc: { status: 'healthy' }, yjs: { status: 'healthy' }, ai: { status: 'healthy' } },
})

/** Build a Headers object with the full security baseline, minus any omitted names. */
function secureHeaders(extra: Record<string, string> = {}, omit: string[] = []): Headers {
  const h = new Headers()
  for (const name of SECURITY_HEADERS) {
    if (!omit.includes(name)) h.set(name, 'set')
  }
  for (const [k, v] of Object.entries(extra)) h.set(k, v)
  return h
}

function res(partial: Partial<HttpResponse>): HttpResponse {
  return { status: 200, ok: true, headers: new Headers(), body: '', ...partial }
}

describe('hasHashedAsset', () => {
  it('detects a hashed entry asset', () => {
    expect(hasHashedAsset(HASHED_HTML)).toBe(true)
  })
  it('returns false when no hashed asset is referenced', () => {
    expect(hasHashedAsset('<html><body>no scripts</body></html>')).toBe(false)
  })
})

describe('isHtmlDocument', () => {
  it('accepts an html document case-insensitively', () => {
    expect(isHtmlDocument('<!DOCTYPE html><HTML>')).toBe(true)
  })
  it('rejects a non-html body', () => {
    expect(isHtmlDocument('{"json":true}')).toBe(false)
  })
})

describe('missingSecurityHeaders', () => {
  it('returns empty when all baseline headers are present', () => {
    expect(missingSecurityHeaders(secureHeaders())).toEqual([])
  })
  it('lists the absent headers', () => {
    const headers = secureHeaders({}, ['X-Frame-Options', 'Referrer-Policy'])
    expect(missingSecurityHeaders(headers)).toEqual(['X-Frame-Options', 'Referrer-Policy'])
  })
  it('matches header names case-insensitively (Headers normalises)', () => {
    const h = new Headers()
    for (const name of SECURITY_HEADERS) h.set(name.toLowerCase(), 'x')
    expect(missingSecurityHeaders(h)).toEqual([])
  })
})

describe('unhealthyComponents', () => {
  it('returns no issues when every component is healthy', () => {
    const body = JSON.stringify({ status: 'healthy', components: { api: { status: 'healthy' }, cdc: { status: 'healthy' } } })
    expect(unhealthyComponents(body)).toEqual([])
  })
  it('reports degraded and unhealthy components with their reason', () => {
    const body = JSON.stringify({
      status: 'degraded',
      components: { api: { status: 'healthy' }, cdc: { status: 'degraded', reason: 'slot_inactive' }, yjs: { status: 'unhealthy', reason: 'timeout' } },
    })
    expect(unhealthyComponents(body)).toEqual<ComponentIssue[]>([
      { name: 'cdc', status: 'degraded', reason: 'slot_inactive' },
      { name: 'yjs', status: 'unhealthy', reason: 'timeout' },
    ])
  })
  it('fails loudly on an unparseable body', () => {
    expect(unhealthyComponents('not json')).toEqual([{ name: '<body>', status: 'unparseable' }])
  })
  it('fails loudly when components are missing', () => {
    expect(unhealthyComponents(JSON.stringify({ status: 'healthy' }))).toEqual([{ name: '<components>', status: 'missing' }])
  })
})

describe('formatComponentIssues', () => {
  it('renders a compact name=status(reason) list', () => {
    const issues: ComponentIssue[] = [
      { name: 'cdc', status: 'degraded', reason: 'slot_inactive' },
      { name: 'ai', status: 'unhealthy' },
    ]
    expect(formatComponentIssues(issues)).toBe('cdc=degraded(slot_inactive), ai=unhealthy')
  })
})

describe('runSmoke', () => {
  /** A get() that returns healthy responses for every endpoint. */
  function healthyGet(url: string): Promise<HttpResponse> {
    if (url.endsWith('/openapi.json')) return Promise.resolve(res({ body: '{}' }))
    if (url.includes('/health?depth=full')) return Promise.resolve(res({ body: HEALTHY_COMPONENTS }))
    if (url.endsWith('/health')) return Promise.resolve(res({ status: 204, ok: true, headers: new Headers({ 'x-app-version': SHA }) }))
    if (url.includes('/__smoke_')) return Promise.resolve(res({ body: '<html><body>app</body></html>' }))
    // frontend root (used by both check 1 and check 5)
    return Promise.resolve(res({ body: HASHED_HTML, headers: secureHeaders() }))
  }

  it('passes every check against a healthy deployment', async () => {
    const results = await runSmoke({ frontendUrl: 'https://app', backendUrl: 'https://api', expectedSha: SHA, get: healthyGet })
    expect(results).toHaveLength(6)
    expect(results.every((r) => r.ok)).toBe(true)
  })

  it('checks deployed SHA for every public service in the rollout matrix', async () => {
    const results = await runSmoke({
      frontendUrl: 'https://app',
      backendUrl: 'https://api',
      expectedSha: SHA,
      services: [
        { service: 'backend', health_url: 'https://api' },
        { service: 'cdc', health_url: '' },
        { service: 'frontend', health_url: 'https://app' },
      ],
      get: healthyGet,
    })
    expect(results.find((r) => r.name === 'backend reports deployed SHA')?.ok).toBe(true)
    expect(results.find((r) => r.name === 'frontend reports deployed SHA')?.ok).toBe(true)
    expect(results.find((r) => r.name === 'cdc reports deployed SHA')).toBeUndefined()
  })

  it('flags a stale service SHA without short-circuiting other checks', async () => {
    const get = (url: string) => (url === 'https://api/health' ? Promise.resolve(res({ status: 204, headers: new Headers({ 'x-app-version': 'old9999' }) })) : healthyGet(url))
    const results = await runSmoke({ frontendUrl: 'https://app', backendUrl: 'https://api', expectedSha: SHA, get })

    const sha = results.find((r) => r.name === 'backend reports deployed SHA')
    expect(sha?.ok).toBe(false)
    expect(sha?.detail).toContain('old9999')
    // The other five still ran and passed.
    expect(results.filter((r) => r.ok)).toHaveLength(5)
  })

  it('reports missing security headers', async () => {
    const get = (url: string) => (url === 'https://app/' ? Promise.resolve(res({ body: HASHED_HTML, headers: secureHeaders({}, ['X-Frame-Options']) })) : healthyGet(url))
    const results = await runSmoke({ frontendUrl: 'https://app', backendUrl: 'https://api', expectedSha: SHA, get })

    const sec = results.find((r) => r.name === 'security headers present')
    expect(sec?.ok).toBe(false)
    expect(sec?.detail).toContain('X-Frame-Options')
  })

  it('captures a thrown fetch error as a failed check', async () => {
    const get = (url: string) => (url.endsWith('/openapi.json') ? Promise.reject(new Error('ECONNREFUSED')) : healthyGet(url))
    const results = await runSmoke({ frontendUrl: 'https://app', backendUrl: 'https://api', expectedSha: SHA, get })

    const api = results.find((r) => r.name === 'backend /openapi.json reachable')
    expect(api?.ok).toBe(false)
    expect(api?.detail).toBe('ECONNREFUSED')
  })

  it('flags a non-ok openapi response', async () => {
    const get = (url: string) => (url.endsWith('/openapi.json') ? Promise.resolve(res({ status: 404, ok: false })) : healthyGet(url))
    const results = await runSmoke({ frontendUrl: 'https://app', backendUrl: 'https://api', expectedSha: SHA, get })
    expect(results.find((r) => r.name === 'backend /openapi.json reachable')?.ok).toBe(false)
  })

  it('retries the component check and passes once the cdc worker reconnects', async () => {
    const reconnecting = JSON.stringify({
      status: 'unhealthy',
      components: { api: { status: 'healthy' }, database: { status: 'healthy' }, cdc: { status: 'unhealthy', reason: 'worker_disconnected' } },
    })
    let depthFullCalls = 0
    const get = (url: string) => {
      if (url.includes('/health?depth=full')) {
        depthFullCalls++
        return Promise.resolve(res({ body: depthFullCalls < 3 ? reconnecting : HEALTHY_COMPONENTS }))
      }
      return healthyGet(url)
    }
    const sleep = vi.fn().mockResolvedValue(undefined)
    const results = await runSmoke({ frontendUrl: 'https://app', backendUrl: 'https://api', expectedSha: SHA, get, sleep, componentsRetryDelayMs: 1 })

    expect(results.find((r) => r.name === 'backend components healthy')?.ok).toBe(true)
    expect(depthFullCalls).toBe(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('fails the component check after exhausting retries, reporting the last issue', async () => {
    const unhealthy = JSON.stringify({
      status: 'unhealthy',
      components: { api: { status: 'healthy' }, cdc: { status: 'unhealthy', reason: 'worker_disconnected' } },
    })
    let depthFullCalls = 0
    const get = (url: string) => {
      if (url.includes('/health?depth=full')) {
        depthFullCalls++
        return Promise.resolve(res({ body: unhealthy }))
      }
      return healthyGet(url)
    }
    const sleep = vi.fn().mockResolvedValue(undefined)
    const results = await runSmoke({
      frontendUrl: 'https://app',
      backendUrl: 'https://api',
      expectedSha: SHA,
      get,
      sleep,
      componentsRetryAttempts: 3,
      componentsRetryDelayMs: 1,
    })

    const components = results.find((r) => r.name === 'backend components healthy')
    expect(components?.ok).toBe(false)
    expect(components?.detail).toContain('cdc=unhealthy(worker_disconnected)')
    expect(depthFullCalls).toBe(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})

describe('parseArgs', () => {
  it('parses the required flags with a default timeout', () => {
    expect(parseArgs(['--frontend', 'https://app', '--backend', 'https://api', '--sha', SHA])).toEqual({
      frontendUrl: 'https://app',
      backendUrl: 'https://api',
      sha: SHA,
      services: undefined,
      timeoutMs: 10000,
    })
  })

  it('parses the rollout services matrix', () => {
    const matrix = JSON.stringify([{ service: 'backend', health_url: 'https://api' }, { service: 'cdc', health_url: '' }])
    expect(parseArgs(['--frontend', 'https://app', '--backend', 'https://api', '--sha', SHA, '--services-json', matrix]).services).toEqual([
      { service: 'backend', health_url: 'https://api' },
      { service: 'cdc', health_url: '' },
    ])
  })

  it('honours an explicit --timeout', () => {
    const args = parseArgs(['--frontend', 'https://app', '--backend', 'https://api', '--sha', SHA, '--timeout', '5000'])
    expect(args.timeoutMs).toBe(5000)
  })

  it.each([
    ['--backend', 'https://api', '--sha', SHA],
    ['--frontend', 'https://app', '--sha', SHA],
    ['--frontend', 'https://app', '--backend', 'https://api'],
  ])('throws when a required flag is missing', (...argv) => {
    expect(() => parseArgs(argv)).toThrow(/Usage:/)
  })
})
