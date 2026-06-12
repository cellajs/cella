/**
 * Verify the edge actually serves the bundle we just uploaded.
 *
 * After publishing index.html to the frontend bucket and purging the edge
 * cache, we poll the public URL until the served index.html references the
 * same hashed entry script as the freshly built dist/index.html. If the served
 * HTML still points at the previous hash, the purge hasn't propagated; if the
 * request fails with a TLS error, the Edge Services managed certificate is
 * likely stuck and we surface a recovery runbook.
 *
 * The HTML parsing and error classification are pure and unit-tested; only the
 * actual HTTP fetch is side-effecting (and injectable).
 *
 * Usage:
 *   tsx infra/tasks/verify-frontend-bundle.ts --url https://app.example \
 *     --dist dist/index.html [--attempts 30] [--interval 3000] [--timeout 8000]
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { getFlag, getNumFlag, sleep } from './args'

/** Extract the hashed entry script src (e.g. /assets/index-abc123.js) from HTML. */
export function extractEntryAsset(html: string): string | undefined {
  const match = html.match(/src="([^"]*assets\/[^"]+\.js)"/)
  return match?.[1]
}

/** True when the served HTML references the expected entry asset. */
export function servedMatches(servedHtml: string, expectedAsset: string | undefined): boolean {
  // When we couldn't extract an expected asset, fall back to "any 200 body is
  // good enough" — matches the previous bash behaviour.
  if (!expectedAsset) return true
  return servedHtml.includes(expectedAsset)
}

export type ProbeKind = 'ok' | 'tls' | 'error'

export interface ProbeResult {
  kind: ProbeKind
  body?: string
  /** Diagnostic detail for non-ok results (error code or HTTP status). */
  detail?: string
}

/**
 * Node's fetch wraps low-level TLS failures as a TypeError whose `cause` carries
 * an OpenSSL-style `code`. We treat these as a distinct, actionable class.
 */
const TLS_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'ERR_TLS_HANDSHAKE_TIMEOUT',
])

/** Classify a thrown fetch error as a TLS failure or a generic error. */
export function classifyError(err: unknown): ProbeResult {
  const cause = (err as { cause?: { code?: string } })?.cause
  const code = cause?.code ?? (err as { code?: string })?.code
  if (code && TLS_ERROR_CODES.has(code)) return { kind: 'tls', detail: code }
  return { kind: 'error', detail: code ?? (err as Error)?.message ?? 'unknown' }
}

export type FetchProbe = (url: string) => Promise<ProbeResult>

/** Default probe using global fetch with no-cache headers and a timeout. */
export function createFetchProbe(timeoutMs: number): FetchProbe {
  return async (url) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      })
      if (!res.ok) return { kind: 'error', detail: `HTTP ${res.status}` }
      return { kind: 'ok', body: await res.text() }
    } catch (err) {
      return classifyError(err)
    } finally {
      clearTimeout(timer)
    }
  }
}

const TLS_RUNBOOK = [
  'Likely cause: Scaleway Edge Services pipeline has a stuck managed certificate.',
  'Recover with:',
  "  scw edge-services pipeline list -o json | jq -r '.[] | select(.status==\"error\") | .id'",
  '  scw edge-services tls-stage list pipeline-id=<id> -o json | jq -r \'.[0].id\'',
  '  scw edge-services tls-stage update <tls-stage-id> managed-certificate=true',
].join('\n')

export interface VerifyOptions {
  url: string
  expectedAsset: string | undefined
  probe: FetchProbe
  attempts?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  log?: (msg: string) => void
}

export type VerifyOutcome =
  | { ok: true; attempts: number }
  | { ok: false; reason: 'tls'; detail?: string }
  | { ok: false; reason: 'timeout' }

/** Poll until the served bundle matches, a TLS failure occurs, or budget runs out. */
export async function verifyBundle(opts: VerifyOptions): Promise<VerifyOutcome> {
  const attempts = opts.attempts ?? 30
  const intervalMs = opts.intervalMs ?? 3000
  const sleepFn = opts.sleep ?? sleep
  const log = opts.log ?? ((msg: string) => console.info(msg))
  const target = `${opts.url}/index.html`

  for (let i = 1; i <= attempts; i++) {
    const result = await opts.probe(target)
    if (result.kind === 'tls') {
      // A TLS failure won't self-heal within the poll window — fail fast.
      return { ok: false, reason: 'tls', detail: result.detail }
    }
    if (result.kind === 'ok' && servedMatches(result.body ?? '', opts.expectedAsset)) {
      log(`Frontend serving new bundle after ${i} attempt(s)`)
      return { ok: true, attempts: i }
    }
    const why = result.kind === 'error' ? result.detail : `does not yet reference ${opts.expectedAsset}`
    log(`Attempt ${i}/${attempts}: ${why}`)
    if (i < attempts) await sleepFn(intervalMs)
  }

  return { ok: false, reason: 'timeout' }
}

interface CliArgs {
  url: string
  dist: string
  attempts: number
  intervalMs: number
  timeoutMs: number
}

/** Parse `--key value` flags. Exported for testing. */
export function parseArgs(argv: string[]): CliArgs {
  const url = getFlag(argv, '--url')
  if (!url) {
    throw new Error('Usage: verify-frontend-bundle.ts --url <frontend-url> [--dist dist/index.html] [--attempts N] [--interval ms] [--timeout ms]')
  }

  return {
    url,
    dist: getFlag(argv, '--dist') ?? 'dist/index.html',
    attempts: getNumFlag(argv, '--attempts', 30),
    intervalMs: getNumFlag(argv, '--interval', 3000),
    timeoutMs: getNumFlag(argv, '--timeout', 8000),
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  
  let html: string
  try {
    html = readFileSync(args.dist, 'utf-8')
  } catch (err) {
    console.error(`::error::Could not read ${args.dist}: ${(err as Error)?.message ?? 'unknown error'}`)
    console.error('::error::The local bundle is required to verify the served bundle. Check the --dist path and the working directory.')
    process.exit(1)
  }

  const expectedAsset = extractEntryAsset(html)
  if (expectedAsset) console.info(`Expecting served index.html to reference: ${expectedAsset}`)
  else console.warn(`::warning::No hashed entry asset found in ${args.dist}; will accept any successful response`)

  const outcome = await verifyBundle({
    url: args.url,
    expectedAsset,
    attempts: args.attempts,
    intervalMs: args.intervalMs,
    probe: createFetchProbe(args.timeoutMs),
  })

  if (outcome.ok) return

  if (outcome.reason === 'tls') {
    console.error(`::error::Frontend TLS failure (${outcome.detail ?? 'unknown'}) on ${args.url}`)
    console.error(TLS_RUNBOOK)
  } else {
    const budget = Math.round((args.attempts * args.intervalMs) / 1000)
    console.error(`::error::Frontend did not serve the new bundle within ~${budget}s`)
  }
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
