/**
 * Fetch a service's boot diagnostics from the dedicated boot diagnostics bucket
 * on a failed rollout. The boot path uploads objects under
 * `boot-diag/`:
 *   - full logs: `<service>-<YYYYMMDD>T<...>-boot.log` — the complete boot transcript.
 *   - failure logs: `<service>-failed-<YYYYMMDD>T<...>.log` when first boot exits non-zero.
 * Older marker objects (`<service>-stage-*`) are still rendered when present.
 *
 * The key selection/filtering (which markers to show, which full log is the
 * latest) is pure and unit-tested; only the two S3 calls are side-effecting and
 * injected. We shell out to the preinstalled `aws` CLI with an arg array (no
 * shell), matching the rest of the deploy tasks; this runs failure-only so it
 * never blocks a green deploy.
 *
 * Usage:
 *   tsx infra/tasks/fetch-boot-diag.ts --bucket <boot-diag-bucket> \
 *     --service <name> --region <scw-region>
 */
import { spawnSync } from 'node:child_process'
import { isMain } from '../lib/is-main'
import { getFlag } from './args'

export interface DiagSelection {
  /** Recent stage/numbered markers, for a quick "how far did it get" overview. */
  markers: string[]
  /** Stage-marker objects whose bodies we print in full (most recent last). */
  stageDetailKeys: string[]
  /** Latest complete boot transcript, if one was uploaded. */
  latestFull?: string
  /**
   * Reconciler-uploaded failure captures (`<svc>-failed-*`, `<svc>-pull-failed-*`):
   * the actual cause of a roll failure (health-gate logs, docker pull/auth
   * error) that wouldn't otherwise appear in a boot transcript. Most recent
   * last; printed prominently because this is usually the answer.
   */
  failureKeys: string[]
}

/** Escape regex metacharacters in the (controlled) service name, defensively. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parse `aws s3 ls` output into object keys. Each line is
 * `<date> <time> <size> <key>`; we take the 4th column (matching the prior
 * `awk '{print $4}'`). Blank lines and `PRE <dir>/` rows yield no key.
 */
export function parseKeys(lsOutput: string): string[] {
  const keys: string[] = []
  for (const line of lsOutput.split('\n')) {
    const cols = line.trim().split(/\s+/)
    if (cols.length >= 4) keys.push(cols[3])
  }
  return keys
}

/**
 * Choose which diagnostic objects to surface for a service. Lexical sort is
 * sufficient because both marker indices and the YYYYMMDDThhmmss timestamps are
 * zero-padded / ISO-ish, so string order == chronological order.
 */
export function selectDiagnostics(keys: string[], service: string): DiagSelection {
  const svc = escapeRe(service)
  const sorted = [...keys].sort()
  const markers = sorted.filter((k) => new RegExp(`^${svc}-(stage|[0-9])`).test(k)).slice(-30)
  const stageDetailKeys = sorted.filter((k) => k.startsWith(`${service}-stage-`)).slice(-10)
  const latestFull = sorted.filter((k) => new RegExp(`^${svc}-[0-9]{8}T`).test(k)).at(-1)
  // Reconciler failure captures: <svc>-failed-* (slot logs), <svc>-pull-failed-*
  // (docker pull/auth stderr) and <svc>-migrate-failed-* (one-shot migrator
  // output). Keep the few most recent.
  const failureKeys = sorted.filter((k) => new RegExp(`^${svc}-(pull-|migrate-)?failed-`).test(k)).slice(-5)
  return { markers, stageDetailKeys, latestFull, failureKeys }
}

/** Reads objects from the boot-diag prefix. Injectable so render() is testable. */
export interface DiagReader {
  /** Return raw `aws s3 ls` output for the boot-diag prefix. */
  list(): string
  /** Return the body of a single boot-diag object key. */
  cat(key: string): string
}

/**
 * Default reader shelling out to the preinstalled aws CLI (no shell). Unlike a
 * bare `.stdout ?? ''`, this surfaces the *reason* a read failed — a missing aws
 * binary, bad credentials, or the wrong bucket — instead of silently returning
 * an empty string that the renderer would misreport as "no logs uploaded". The
 * `list` failure throws (without it nothing else can run); a per-object `cat`
 * failure is left for the renderer to annotate inline so one unreadable object
 * doesn't abort the whole dump.
 */
export function createAwsReader(endpoint: string, bucket: string): DiagReader {
  const prefix = `s3://${bucket}/boot-diag/`
  const run = (args: string[], what: string): string => {
    const res = spawnSync('aws', args, { encoding: 'utf-8' })
    if (res.error) {
      if ((res.error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('aws CLI not found on PATH — install the AWS CLI to read boot diagnostics')
      }
      throw new Error(`aws ${what} failed: ${res.error.message}`)
    }
    if (res.status !== 0) {
      throw new Error(`aws ${what} exited ${res.status}: ${(res.stderr ?? '').trim() || '(no stderr)'}`)
    }
    return res.stdout ?? ''
  }
  return {
    list: () => run(['--endpoint-url', endpoint, 's3', 'ls', prefix], `s3 ls ${prefix}`),
    cat: (key) => run(['--endpoint-url', endpoint, 's3', 'cp', `${prefix}${key}`, '-'], `s3 cp ${key}`),
  }
}

/** Per-service rollup of what diagnostics exist, for the `--list` overview. */
export interface BundleSummary {
  service: string
  /** Total boot-diag objects owned by this service. */
  total: number
  /** How many of them are reconciler failure captures (the ones that matter). */
  failures: number
  /** Latest full boot transcript key, if any. */
  latestFull?: string
}

/**
 * Summarise the boot-diag prefix per service — a quick "what's here" overview so
 * a caller (or Copilot) can see which services have evidence and which have a
 * failure capture worth opening, without dumping every body.
 */
export function summarizeBundles(keys: string[], serviceNames: readonly string[]): BundleSummary[] {
  return serviceNames.map((service) => {
    const svc = escapeRe(service)
    const owned = keys.filter((k) => new RegExp(`^${svc}-`).test(k))
    const sel = selectDiagnostics(keys, service)
    return { service, total: owned.length, failures: sel.failureKeys.length, latestFull: sel.latestFull }
  })
}

/**
 * Print the selected diagnostics. `style` controls presentation: `'ci'` emits
 * GitHub Actions collapsible `::group::` log groups (the default, for the deploy
 * workflow); `'plain'` emits readable section headers for a local terminal. A
 * per-object read that fails is annotated inline rather than aborting the dump.
 */
export function renderDiagnostics(
  service: string,
  sel: DiagSelection,
  reader: DiagReader,
  log: (msg: string) => void = console.info,
  style: 'ci' | 'plain' = 'ci',
): void {
  const open = (title: string) => log(style === 'ci' ? `::group::${title}` : `\n=== ${title} ===`)
  const close = () => style === 'ci' && log('::endgroup::')
  const warn = (msg: string) => log(style === 'ci' ? `::warning::${msg}` : `! ${msg}`)
  const safeCat = (key: string): string => {
    try {
      return reader.cat(key)
    } catch (err) {
      return `<<failed to read ${key}: ${err instanceof Error ? err.message : String(err)}>>`
    }
  }

  // Failure captures first — this is usually the actual answer (pull/auth error
  // or the failed slot's logs), so surface it before the boot transcript.
  for (const key of sel.failureKeys ?? []) {
    open(`⚠️ ${key}`)
    log(safeCat(key))
    close()
  }

  open(`Stage markers (${service}-*)`)
  for (const marker of sel.markers) log(marker)
  close()

  for (const key of sel.stageDetailKeys) {
    open(key)
    log(safeCat(key))
    close()
  }

  if (sel.latestFull) {
    open(`${service} boot diagnostics (${sel.latestFull})`)
    log(safeCat(sel.latestFull))
    close()
  } else {
    warn(`No ${service} full boot-diag log uploaded`)
  }
}

interface CliArgs {
  bucket: string
  service: string
  region: string
}

/** Parse `--key value` flags. Exported for testing. */
export function parseArgs(argv: string[]): CliArgs {
  const bucket = getFlag(argv, '--bucket')
  const service = getFlag(argv, '--service')
  const region = getFlag(argv, '--region')
  if (!bucket || !service || !region) {
    throw new Error('Usage: fetch-boot-diag.ts --bucket <state-bucket> --service <name> --region <scw-region>')
  }
  return { bucket, service, region }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { bucket, service, region } = parseArgs(argv)
  const reader = createAwsReader(`https://s3.${region}.scw.cloud`, bucket)
  const selection = selectDiagnostics(parseKeys(reader.list()), service)
  // CI gets collapsible groups; a manual local run gets plain headers.
  renderDiagnostics(service, selection, reader, console.info, process.env.GITHUB_ACTIONS === 'true' ? 'ci' : 'plain')
}

if (isMain(import.meta.url)) await main()
