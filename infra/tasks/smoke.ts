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
 * Checks:
 *   1. Frontend index.html references a hashed entry asset. When the freshly
 *      built bundle hash is supplied via --dist, the check is stricter: the
 *      served index.html must reference that exact entry asset (the post-publish
 *      bundle verification, folded in from the former verify-frontend-bundle).
 *   2. Backend /openapi.json is reachable (API router mounted).
 *   3. Public service /health endpoints report the deployed release SHA.
 *   4. A random path returns an HTML document (SPA fallback / deep links work).
 *   5. Frontend responses carry the OWASP security-header baseline (Caddy live).
 *   6. Backend /health?depth=full shows every component healthy (no degraded
 *      database / cdc / yjs / ai after the rollout settled).
 *
 * Usage:
 *   tsx infra/tasks/smoke.ts --frontend <url> --backend <url> --sha <git-sha> [--services-json <enabled_services_json>] [--dist dist/index.html]
 */
import { readFileSync } from 'node:fs'
import { sleep as defaultSleep } from 'shared/sleep'
import { errorMessage } from '../lib/utils/errors'
import { isMain } from '../lib/utils/is-main'
import { pollUntil } from '../lib/utils/retry'
import { parseServiceRows } from '../lib/utils/service-rows'
import { getFlag } from './args'
import { isHealthy } from './wait-for-version'

/** Extract the hashed entry script src (e.g. /assets/index-abc123.js) from HTML. */
export function extractEntryAsset(html: string): string | undefined {
  const match = html.match(/src="([^"]*assets\/[^"]+\.js)"/)
  return match?.[1]
}

/**
 * Response headers the frontend Caddy layer must inject. A missing header means
 * the Caddyfile regressed or the request bypassed Caddy entirely. Compared
 * case-insensitively.
 */
export const SECURITY_HEADERS = [
  'Content-Security-Policy',
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

/** One enabled rollout service as emitted by print-deploy-env's enabled_services_json. */
export interface SmokeService {
  service: string
  health_url: string
}

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
  /** Enabled rollout services; public services carry health_url, internal-only services have ''. */
  services?: readonly SmokeService[]
  /**
   * Hashed entry asset (e.g. /assets/index-abc123.js) from the freshly built
   * local bundle. When set, check #1 asserts the served index.html references
   * this exact asset; when absent it falls back to "references some hashed asset".
   */
  expectedAsset?: string
  get: HttpGet
  log?: (msg: string) => void
  /** Sleep between component-health retries. Injectable so tests run instantly. */
  sleep?: (ms: number) => Promise<void>
  /** Number of times to poll /health?depth=full before failing (default {@link COMPONENTS_RETRY_ATTEMPTS}). */
  componentsRetryAttempts?: number
  /** Delay between component-health polls in ms (default {@link COMPONENTS_RETRY_DELAY_MS}). */
  componentsRetryDelayMs?: number
}

/**
 * Component-health (check #6) retry budget. Right after a rollout the CDC
 * worker's WebSocket can still be mid-reconnect (exponential backoff up to 30s),
 * which the backend surfaces as a transient `cdc=unhealthy(worker_disconnected)`.
 * Polling across roughly one backoff cycle lets that settle while a genuinely
 * broken component stays bad for the whole budget and still fails the gate.
 */
export const COMPONENTS_RETRY_ATTEMPTS = 6
export const COMPONENTS_RETRY_DELAY_MS = 8_000


export interface SmokeResult {
  name: string
  ok: boolean
  detail?: string
}

/** Run all smoke checks, collecting every result (no short-circuit). */
export async function runSmoke(opts: SmokeOptions): Promise<SmokeResult[]> {
  const { frontendUrl, backendUrl, expectedSha, get } = opts
  const sleep = opts.sleep ?? defaultSleep
  const componentsRetryAttempts = opts.componentsRetryAttempts ?? COMPONENTS_RETRY_ATTEMPTS
  const componentsRetryDelayMs = opts.componentsRetryDelayMs ?? COMPONENTS_RETRY_DELAY_MS
  const results: SmokeResult[] = []

  // Runs one named check: the body returns `ok` (+ failure detail), the wrapper
  // owns the try/catch and result collection so no check can short-circuit.
  const check = async (name: string, fn: () => Promise<{ ok: boolean; detail?: string }>): Promise<void> => {
    try {
      const { ok, detail } = await fn()
      results.push(ok ? { name, ok: true } : { name, ok: false, detail })
    } catch (err) {
      results.push({ name, ok: false, detail: errorMessage(err) })
    }
  }

  // 1. Frontend index.html references the freshly built hashed entry asset.
  // When the local dist hash is known (expectedAsset), assert the served HTML
  // references that exact bundle — the post-publish bundle check folded in from
  // the former verify-frontend-bundle task. Otherwise fall back to "references
  // some hashed asset" so the check still runs without the artifact.
  await check(opts.expectedAsset ? 'index.html references freshly built bundle' : 'index.html references hashed asset', async () => {
    const res = await get(`${frontendUrl}/`)
    const matched = opts.expectedAsset ? res.body.includes(opts.expectedAsset) : hasHashedAsset(res.body)
    // Detail mirrors the branch that actually failed: a bad status, or a 200
    // whose HTML lacks the expected (or any) hashed entry asset.
    const detail = !res.ok
      ? `status=${res.status}`
      : opts.expectedAsset
        ? `served does not reference ${opts.expectedAsset}`
        : 'no hashed entry asset found in served index.html'
    return { ok: res.ok && matched, detail }
  })

  // 2. Backend OpenAPI spec is reachable.
  await check('backend /openapi.json reachable', async () => {
    const res = await get(`${backendUrl}/openapi.json`)
    return { ok: res.ok, detail: `status=${res.status}` }
  })

  // 3. Public services report the deployed release SHA. Internal-only services
  // (cdc) have no health_url and are covered by the aggregate backend health.
  const publicServices = (opts.services ?? [{ service: 'backend', health_url: backendUrl }]).filter((service) => service.health_url)
  for (const service of publicServices) {
    await check(`${service.service} reports deployed SHA`, async () => {
      const res = await get(`${service.health_url}/health`)
      const version = res.headers.get('x-app-version') ?? undefined
      return {
        ok: isHealthy({ status: res.status, version }, expectedSha),
        detail: `served=${version ?? '<missing>'} expected=${expectedSha}`,
      }
    })
  }

  // 4. SPA route fallback returns an HTML document.
  await check('SPA fallback returns HTML', async () => {
    const res = await get(`${frontendUrl}/__smoke_${Date.now()}`)
    return { ok: res.ok && isHtmlDocument(res.body), detail: `status=${res.status}` }
  })

  // 5. Frontend security headers are present.
  await check('security headers present', async () => {
    const res = await get(`${frontendUrl}/`)
    const missing = missingSecurityHeaders(res.headers)
    return { ok: missing.length === 0, detail: `missing: ${missing.join(', ')}` }
  })

  // 6. Backend reports every health component healthy (db / cdc / yjs / ai).
  // Retried across one CDC-reconnect backoff cycle: right after a roll the
  // worker's WebSocket can still be mid-reconnect, surfacing as a transient
  // worker_disconnected. Pass on the first clean read; a genuinely broken
  // component stays bad for the whole budget and still fails.
  await check('backend components healthy', async () => {
    let lastDetail = 'no response'
    const healthy = await pollUntil(
      async () => {
        try {
          const res = await get(`${backendUrl}/health?depth=full`)
          if (!res.ok) {
            lastDetail = `status=${res.status}`
            return undefined
          }
          const issues = unhealthyComponents(res.body)
          if (issues.length === 0) return true
          lastDetail = formatComponentIssues(issues)
        } catch (err) {
          lastDetail = errorMessage(err)
        }
        return undefined
      },
      { attempts: componentsRetryAttempts, intervalMs: componentsRetryDelayMs, sleep },
    )
    return { ok: healthy === true, detail: lastDetail }
  })

  return results
}

interface CliArgs {
  frontendUrl: string
  backendUrl: string
  sha: string
  services?: SmokeService[]
  /** Path to the freshly built local index.html, used to derive the expected bundle hash. */
  dist?: string
  timeoutMs: number
}

export function parseServicesJson(raw: string): Array<SmokeService & { public_url?: string }> {
  return parseServiceRows(raw, '--services-json', { required: ['service', 'health_url'], optional: ['public_url'] })
}

/** Parse `--key value` flags. Exported for testing. */
export function parseArgs(argv: string[]): CliArgs {
  const servicesRaw = getFlag(argv, '--services-json')
  const services = servicesRaw ? parseServicesJson(servicesRaw) : undefined
  const frontendUrl = getFlag(argv, '--frontend') ?? services?.find((service) => service.service === 'frontend')?.public_url
  const backendUrl = getFlag(argv, '--backend') ?? services?.find((service) => service.service === 'backend')?.public_url
  const sha = getFlag(argv, '--sha')
  if (!frontendUrl || !backendUrl || !sha) {
    throw new Error('Usage: smoke.ts --frontend <url> --backend <url> --sha <git-sha> [--services-json <json>] [--timeout ms]')
  }
  const timeoutRaw = getFlag(argv, '--timeout')
  return { frontendUrl, backendUrl, sha, services, dist: getFlag(argv, '--dist'), timeoutMs: timeoutRaw === undefined ? 10000 : Number(timeoutRaw) }
}

/**
 * Resolve the expected hashed entry asset from the freshly built local bundle.
 * A provided-but-unreadable --dist is a hard failure: it once silently degraded
 * the bundle check into a no-op (a wrong cwd resolved the path to nothing).
 */
export function resolveExpectedAsset(dist: string | undefined): string | undefined {
  if (!dist) return undefined
  let html: string
  try {
    html = readFileSync(dist, 'utf-8')
  } catch (err) {
    console.error(`::error::Could not read ${dist}: ${errorMessage(err)}`)
    console.error('::error::The local bundle is required to verify the served bundle. Check the --dist path and the working directory.')
    process.exit(1)
  }
  const expectedAsset = extractEntryAsset(html)
  if (expectedAsset) console.info(`Expecting served index.html to reference: ${expectedAsset}`)
  else console.warn(`::warning::No hashed entry asset found in ${dist}; falling back to "references some hashed asset"`)
  return expectedAsset
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  const expectedAsset = resolveExpectedAsset(args.dist)
  const results = await runSmoke({
    frontendUrl: args.frontendUrl,
    backendUrl: args.backendUrl,
    expectedSha: args.sha,
    services: args.services,
    expectedAsset,
    get: createFetchGet(args.timeoutMs),
  })

  for (const r of results) {
    if (r.ok) console.info(`✓ ${r.name}`)
    else console.error(`::error::${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  }

  if (results.some((r) => !r.ok)) process.exit(1)
}

if (isMain(import.meta.url)) await main()
