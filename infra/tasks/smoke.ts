/**
 * Last-mile smoke checks against the now-live bundle + API, run after the
 * frontend bundle cutover. Each check targets a single HTTP contract that, if
 * broken, makes the app unusable for everyone; anything heavier (auth, DB
 * writes) belongs in the e2e suite, not the critical-path deploy pipeline.
 *
 * The assertions are pure and unit-tested; only the HTTP fetches are
 * side-effecting (and injected). All checks run even if an earlier one fails so
 * a single deploy surfaces every broken contract at once, then the task exits
 * non-zero if any failed.
 *
 * Checks:
 *   1. Frontend index.html references a hashed entry asset (build wired up).
 *   2. Backend /openapi.json is reachable (API router mounted).
 *   3. Backend /health reports the deployed release SHA (no mid-deploy restart).
 *   4. A random path returns an HTML document (SPA fallback / deep links work).
 *   5. Frontend responses carry the OWASP security-header baseline (Caddy live).
 *   6. Backend /health?depth=full shows every component healthy (no degraded
 *      database / cdc / yjs / ai after the rollout settled).
 *
 * Usage:
 *   tsx infra/tasks/smoke.ts --frontend <url> --backend <url> --sha <git-sha>
 */
import { pathToFileURL } from 'node:url'
import { getFlag } from './cli'
import { extractEntryAsset } from './verify-frontend-bundle'
import { isHealthy } from './wait-for-version'

/**
 * OWASP-recommended response headers that Caddy injects and S3 + Edge Services
 * cannot. A missing header means the Caddyfile regressed or the request
 * bypassed Caddy entirely. Compared case-insensitively.
 */
export const SECURITY_HEADERS = [
  'Strict-Transport-Security',
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Cross-Origin-Opener-Policy',
] as const

/** True when the HTML references a hashed entry script (e.g. /assets/index-abc.js). */
export function hasHashedAsset(html: string): boolean {
  return extractEntryAsset(html) !== undefined
}

/** True when the body looks like an HTML document (SPA fallback served index.html). */
export function isHtmlDocument(body: string): boolean {
  return /<html/i.test(body)
}

/** Header names from SECURITY_HEADERS that are absent from the response. */
export function missingSecurityHeaders(headers: Headers): string[] {
  return SECURITY_HEADERS.filter((h) => headers.get(h) === null)
}

/** A single non-healthy component found in a /health?depth=full body. */
export interface ComponentIssue {
  name: string
  status: string
  reason?: string
}

/**
 * Parse a /health?depth=full body and return every component that is not
 * healthy. A non-critical worker that is fully down surfaces as `degraded`
 * (the backend rollup caps non-critical components there so it never
 * deregisters itself), so this check intentionally treats anything other than
 * `healthy` as a failure — by the time smoke runs, all services have rolled
 * green and nothing should be degraded. A malformed/empty body yields a
 * synthetic issue so the check fails loudly instead of passing silently.
 */
export function unhealthyComponents(body: string): ComponentIssue[] {
  let parsed: { components?: Record<string, { status?: string; reason?: string }> }
  try {
    parsed = JSON.parse(body)
  } catch {
    return [{ name: '<body>', status: 'unparseable' }]
  }
  const components = parsed.components
  if (!components || typeof components !== 'object') return [{ name: '<components>', status: 'missing' }]

  const issues: ComponentIssue[] = []
  for (const [name, component] of Object.entries(components)) {
    if (component?.status !== 'healthy') issues.push({ name, status: component?.status ?? 'unknown', reason: component?.reason })
  }
  return issues
}

/** Render component issues as a compact `name=status(reason)` list for CI logs. */
export function formatComponentIssues(issues: ComponentIssue[]): string {
  return issues.map((i) => `${i.name}=${i.status}${i.reason ? `(${i.reason})` : ''}`).join(', ')
}

export interface HttpResponse {
  status: number
  ok: boolean
  headers: Headers
  body: string
}

/** Performs a single HTTP GET. Injectable so the runner can be unit-tested. */
export type HttpGet = (url: string) => Promise<HttpResponse>

/** Default GET using global fetch with no-cache headers and a timeout. */
export function createFetchGet(timeoutMs: number): HttpGet {
  return async (url) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      })
      return { status: res.status, ok: res.ok, headers: res.headers, body: await res.text() }
    } finally {
      clearTimeout(timer)
    }
  }
}

export interface SmokeOptions {
  frontendUrl: string
  backendUrl: string
  expectedSha: string
  get: HttpGet
  log?: (msg: string) => void
}

export interface SmokeResult {
  name: string
  ok: boolean
  detail?: string
}

/** Run all smoke checks, collecting every result (no short-circuit). */
export async function runSmoke(opts: SmokeOptions): Promise<SmokeResult[]> {
  const { frontendUrl, backendUrl, expectedSha, get } = opts
  const results: SmokeResult[] = []

  // 1. Frontend index.html references a hashed asset.
  try {
    const res = await get(`${frontendUrl}/`)
    results.push(
      res.ok && hasHashedAsset(res.body)
        ? { name: 'index.html references hashed asset', ok: true }
        : { name: 'index.html references hashed asset', ok: false, detail: `status=${res.status}` },
    )
  } catch (err) {
    results.push({ name: 'index.html references hashed asset', ok: false, detail: (err as Error).message })
  }

  // 2. Backend OpenAPI spec is reachable.
  try {
    const res = await get(`${backendUrl}/openapi.json`)
    results.push({ name: 'backend /openapi.json reachable', ok: res.ok, detail: res.ok ? undefined : `status=${res.status}` })
  } catch (err) {
    results.push({ name: 'backend /openapi.json reachable', ok: false, detail: (err as Error).message })
  }

  // 3. Backend reports the deployed release SHA.
  try {
    const res = await get(`${backendUrl}/health`)
    const version = res.headers.get('x-app-version') ?? undefined
    results.push(
      isHealthy({ status: res.status, version }, expectedSha)
        ? { name: 'backend reports deployed SHA', ok: true }
        : { name: 'backend reports deployed SHA', ok: false, detail: `served=${version ?? '<missing>'} expected=${expectedSha}` },
    )
  } catch (err) {
    results.push({ name: 'backend reports deployed SHA', ok: false, detail: (err as Error).message })
  }

  // 4. SPA route fallback returns an HTML document.
  try {
    const res = await get(`${frontendUrl}/__smoke_${Date.now()}`)
    results.push(
      res.ok && isHtmlDocument(res.body)
        ? { name: 'SPA fallback returns HTML', ok: true }
        : { name: 'SPA fallback returns HTML', ok: false, detail: `status=${res.status}` },
    )
  } catch (err) {
    results.push({ name: 'SPA fallback returns HTML', ok: false, detail: (err as Error).message })
  }

  // 5. Frontend security headers are present.
  try {
    const res = await get(`${frontendUrl}/`)
    const missing = missingSecurityHeaders(res.headers)
    results.push(missing.length === 0 ? { name: 'security headers present', ok: true } : { name: 'security headers present', ok: false, detail: `missing: ${missing.join(', ')}` })
  } catch (err) {
    results.push({ name: 'security headers present', ok: false, detail: (err as Error).message })
  }

  // 6. Backend reports every health component healthy (db / cdc / yjs / ai).
  try {
    const res = await get(`${backendUrl}/health?depth=full`)
    if (!res.ok) {
      results.push({ name: 'backend components healthy', ok: false, detail: `status=${res.status}` })
    } else {
      const issues = unhealthyComponents(res.body)
      results.push(
        issues.length === 0
          ? { name: 'backend components healthy', ok: true }
          : { name: 'backend components healthy', ok: false, detail: formatComponentIssues(issues) },
      )
    }
  } catch (err) {
    results.push({ name: 'backend components healthy', ok: false, detail: (err as Error).message })
  }

  return results
}

interface CliArgs {
  frontendUrl: string
  backendUrl: string
  sha: string
  timeoutMs: number
}

/** Parse `--key value` flags. Exported for testing. */
export function parseArgs(argv: string[]): CliArgs {
  const frontendUrl = getFlag(argv, '--frontend')
  const backendUrl = getFlag(argv, '--backend')
  const sha = getFlag(argv, '--sha')
  if (!frontendUrl || !backendUrl || !sha) {
    throw new Error('Usage: smoke.ts --frontend <url> --backend <url> --sha <git-sha> [--timeout ms]')
  }
  const timeoutRaw = getFlag(argv, '--timeout')
  return { frontendUrl, backendUrl, sha, timeoutMs: timeoutRaw === undefined ? 10000 : Number(timeoutRaw) }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  const results = await runSmoke({
    frontendUrl: args.frontendUrl,
    backendUrl: args.backendUrl,
    expectedSha: args.sha,
    get: createFetchGet(args.timeoutMs),
  })

  for (const r of results) {
    if (r.ok) console.info(`✓ ${r.name}`)
    else console.error(`::error::${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  }

  if (results.some((r) => !r.ok)) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
