/**
 * Fetch a service's boot diagnostics from the Pulumi state bucket on a failed
 * rollout. The reconciler/cloud-init uploads two kinds of objects under
 * `boot-diag/`:
 *   - stage markers: `<service>-stage-<n>-<label>` written as each boot phase
 *     completes — the last few tell us how far the VM got before stalling.
 *   - full logs: `<service>-<YYYYMMDD>T<...>` — the complete boot transcript.
 *
 * The key selection/filtering (which markers to show, which full log is the
 * latest) is pure and unit-tested; only the two S3 calls are side-effecting and
 * injected. We shell out to the preinstalled `aws` CLI with an arg array (no
 * shell), matching the rest of the deploy tasks; this runs failure-only so it
 * never blocks a green deploy.
 *
 * Usage:
 *   tsx infra/tasks/fetch-boot-diag.ts --bucket <state-bucket> \
 *     --service <name> --region <scw-region>
 */
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { getFlag } from './cli'

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

/** Default reader shelling out to the preinstalled aws CLI (no shell). */
export function createAwsReader(endpoint: string, bucket: string): DiagReader {
  const prefix = `s3://${bucket}/boot-diag/`
  return {
    list: () => spawnSync('aws', ['--endpoint-url', endpoint, 's3', 'ls', prefix], { encoding: 'utf-8' }).stdout ?? '',
    cat: (key) => spawnSync('aws', ['--endpoint-url', endpoint, 's3', 'cp', `${prefix}${key}`, '-'], { encoding: 'utf-8' }).stdout ?? '',
  }
}

/** Print the selected diagnostics as collapsible Actions log groups. */
export function renderDiagnostics(service: string, sel: DiagSelection, reader: DiagReader, log: (msg: string) => void = console.info): void {
  // Failure captures first — this is usually the actual answer (pull/auth error
  // or the failed slot's logs), so surface it before the boot transcript.
  for (const key of sel.failureKeys ?? []) {
    log(`::group::⚠️ ${key}`)
    log(reader.cat(key))
    log('::endgroup::')
  }

  log(`::group::Stage markers (${service}-*)`)
  for (const marker of sel.markers) log(marker)
  log('::endgroup::')

  for (const key of sel.stageDetailKeys) {
    log(`::group::${key}`)
    log(reader.cat(key))
    log('::endgroup::')
  }

  if (sel.latestFull) {
    log(`::group::${service} boot diagnostics (${sel.latestFull})`)
    log(reader.cat(sel.latestFull))
    log('::endgroup::')
  } else {
    log(`::warning::No ${service} full boot-diag log uploaded`)
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
  renderDiagnostics(service, selection, reader)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
