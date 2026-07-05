/**
 * Poll a service's /health endpoint until it serves the expected release SHA.
 *
 * The deploy pipeline asserts X-App-Version == <git sha> before declaring a
 * service rolled. Centralising the health/header contract here makes it
 * testable and runnable locally.
 *
 * Health contract (see backend /health + infra/caddy):
 *   - backend / yjs / ai return 204 (no body)
 *   - frontend (Caddy) returns 200 with body 'ok'
 *   - all emit an `X-App-Version` header carrying the baked-in RELEASE_SHA
 *
 * Usage:
 *   tsx infra/tasks/wait-for-version.ts --url https://api.example/health \
 *     --sha <git-sha> [--attempts 100] [--interval 3000] [--timeout 8000]
 */
import { isMain } from '../lib/utils/is-main'
import { pollUntil } from '../lib/utils/retry'
import { getFlag, getNumFlag, sleep } from './args'

export interface ProbeResult {
  /** HTTP status of the response, or 0 if the request failed entirely. */
  status: number
  /** Value of the X-App-Version header, lowercased lookup, or undefined. */
  version: string | undefined
}

/** Performs a single HTTP probe. Injectable so the poller can be unit-tested. */
export type ProbeFn = (url: string) => Promise<ProbeResult>

/**
 * The reconciler's self-reported roll status (s3://<tag-bucket>/status/<svc>.json).
 * Only the fields the poller acts on are typed; the object carries more.
 */
export interface RollStatus {
  /** Tag the reconciler is rolling TO — must match our SHA to be relevant. */
  desired?: string
  /** Current phase: pulling|migrating|slot-up|probing|flipping|…|done. */
  phase?: string
  /** rolling (in progress) | ok (committed) | failed (gave up this attempt). */
  result?: string
  /** Human-readable failure reason when result=failed. */
  reason?: string
  /** The die() exit code as a string; drives the terminal-vs-transient split. */
  exitCode?: string
}

/**
 * Reconciler exit codes that mean THE RELEASE ITSELF is bad and waiting won't
 * help: 4 compose-up, 5 health/blue-green, 6 migrate. The reconciler is a
 * converging loop, so the infra transients (2 tag-fetch, 3 pull) self-heal on
 * the next 20s tick — we keep polling through those and only fast-fail here.
 */
const TERMINAL_EXIT_CODES = new Set(['4', '5', '6'])

/** Reads the reconciler status object. Injectable so the poller is testable. */
export type StatusFn = () => RollStatus | undefined

export interface PollOptions {
  url: string
  expectedSha: string
  probe: ProbeFn
  attempts?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  log?: (msg: string) => void
  /**
   * Optional reconciler status reader. When provided, a TERMINAL failure for
   * OUR sha (a bad release — see TERMINAL_EXIT_CODES) aborts the poll
   * immediately with the reconciler's reason instead of burning the whole
   * budget. Infra transients (tag-fetch/pull) self-heal on the next tick, so we
   * keep polling through those and just surface the phase. Best-effort — a
   * missing/unparseable status never changes the outcome.
   */
  status?: StatusFn
}

export interface PollOutcome {
  ok: boolean
  attempts: number
  lastStatus?: number
  lastVersion?: string
  /** Set when the reconciler reported a hard failure for our SHA. */
  failReason?: string
}

/**
 * A probe is "healthy" when the status is a documented success (200 for the
 * Caddy frontend, 204 for the API services) AND the served version matches the
 * SHA we are rolling to. A 200/204 with a stale or missing version means the
 * old container is still answering — keep waiting.
 */
export function isHealthy(result: ProbeResult, expectedSha: string): boolean {
  const statusOk = result.status === 200 || result.status === 204
  return statusOk && result.version === expectedSha
}

/**
 * Default probe using global fetch with a per-request timeout. A failed request
 * (network error, TLS, timeout) surfaces as status 0 rather than throwing, so
 * the caller keeps polling instead of aborting the whole deploy on one blip.
 */
export function createFetchProbe(timeoutMs: number): ProbeFn {
  return async (url) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
      return { status: res.status, version: res.headers.get('x-app-version') ?? undefined }
    } catch {
      return { status: 0, version: undefined }
    } finally {
      clearTimeout(timer)
    }
  }
}

/** Poll until the service serves `expectedSha` or the attempt budget is spent. */
export async function pollForVersion(opts: PollOptions): Promise<PollOutcome> {
  const { url, expectedSha, probe } = opts
  const attempts = opts.attempts ?? 100
  const intervalMs = opts.intervalMs ?? 3000
  const log = opts.log ?? ((msg: string) => console.info(msg))

  let lastStatus: number | undefined
  let lastVersion: string | undefined

  const outcome = await pollUntil<PollOutcome>(
    async (i) => {
      const result = await probe(url)
      lastStatus = result.status
      lastVersion = result.version

      if (isHealthy(result, expectedSha)) {
        log(`Serving ${expectedSha} after ${i} attempt(s)`)
        return { ok: true, attempts: i, lastStatus, lastVersion }
      }

      // Consult the reconciler's own status. Fast-fail ONLY on a terminal rollout
      // failure (bad release); keep polling through self-healing infra transients
      // (pull/tag-fetch) and just surface the phase/reason so the CI log shows
      // progress instead of silence.
      const roll = opts.status?.()
      if (roll && roll.desired === expectedSha) {
        if (roll.result === 'failed' && roll.exitCode && TERMINAL_EXIT_CODES.has(roll.exitCode)) {
          const reason = roll.reason || 'unknown'
          log(`Reconciler reported a terminal rollout failure for ${expectedSha} (exit ${roll.exitCode}): ${reason}`)
          return { ok: false, attempts: i, lastStatus, lastVersion, failReason: reason }
        }
        const where = roll.result === 'failed' ? `retrying after ${roll.reason ?? 'failure'}` : `phase=${roll.phase ?? '<none>'}`
        log(`Attempt ${i}/${attempts}: reconciler ${where} status=${result.status || '<none>'} served=${result.version ?? '<missing>'}`)
      } else {
        log(`Attempt ${i}/${attempts}: status=${result.status || '<none>'} served=${result.version ?? '<missing>'}`)
      }
      return undefined
    },
    { attempts, intervalMs, sleep: opts.sleep ?? sleep },
  )

  return outcome ?? { ok: false, attempts, lastStatus, lastVersion }
}

interface CliArgs {
  url: string
  sha: string
  attempts: number
  intervalMs: number
  timeoutMs: number
}

/** Parse `--key value` flags. Exported for testing. */
export function parseArgs(argv: string[]): CliArgs {
  const url = getFlag(argv, '--url')
  const sha = getFlag(argv, '--sha')
  if (!url || !sha) {
    throw new Error('Usage: wait-for-version.ts --url <health-url> --sha <git-sha> [--attempts N] [--interval ms] [--timeout ms]')
  }

  return {
    url,
    sha,
    attempts: getNumFlag(argv, '--attempts', 100),
    intervalMs: getNumFlag(argv, '--interval', 3000),
    timeoutMs: getNumFlag(argv, '--timeout', 8000),
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  console.info(`Probing ${args.url} — expecting X-App-Version: ${args.sha}`)

  const outcome = await pollForVersion({
    url: args.url,
    expectedSha: args.sha,
    attempts: args.attempts,
    intervalMs: args.intervalMs,
    probe: createFetchProbe(args.timeoutMs),
  })

  if (!outcome.ok) {
    if (outcome.failReason) {
      console.error(`::error::Reconciler failed to roll ${args.sha}: ${outcome.failReason}`)
      process.exit(1)
    }
    const budget = Math.round((args.attempts * args.intervalMs) / 1000)
    console.error(
      `::error::Did not roll to ${args.sha} within ~${budget}s (last served: ${outcome.lastVersion ?? '<unknown>'}, status: ${outcome.lastStatus ?? '<none>'})`,
    )
    process.exit(1)
  }
}

if (isMain(import.meta.url)) await main()
