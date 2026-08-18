import { spawnSync } from 'node:child_process';
import { errorMessage } from '../lib/utils/errors';
import { isMain } from '../lib/utils/is-main';
import { getFlag } from './args';

export interface DiagSelection {
  /** Recent stage/numbered markers, for a quick "how far did it get" overview. */
  markers: string[];
  /** Stage-marker objects whose bodies we print in full (most recent last). */
  stageDetailKeys: string[];
  /** Latest complete boot transcript, if one was uploaded. */
  latestFull?: string;
  /**
   * Reconciler-uploaded failure captures (`<svc>-failed-*`, `<svc>-pull-failed-*`): the cause of a roll failure that never reaches a boot transcript.
   * Most recent last.
   */
  failureKeys: string[];
}

/** Escape regex metacharacters in the (controlled) service name, defensively. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse `aws s3 ls` output into object keys: the 4th column of `<date> <time> <size> <key>`. Blank lines and `PRE <dir>/` rows yield no key. */
export function parseKeys(lsOutput: string): string[] {
  const keys: string[] = [];
  for (const line of lsOutput.split('\n')) {
    const key = line.trim().split(/\s+/)[3];
    if (key) keys.push(key);
  }
  return keys;
}

/** Choose which diagnostic objects to show for a service. Lexical sort equals chronological order because marker indices and YYYYMMDDThhmmss timestamps are zero-padded. */
export function selectDiagnostics(keys: string[], service: string): DiagSelection {
  const svc = escapeRe(service);
  const sorted = [...keys].sort();
  const markers = sorted.filter((k) => new RegExp(`^${svc}-(stage|[0-9])`).test(k)).slice(-30);
  const stageDetailKeys = sorted.filter((k) => k.startsWith(`${service}-stage-`)).slice(-10);
  // Pin to -boot.log: the sibling -events.jsonl sorts after it and would win .at(-1), replacing the readable transcript with raw OTLP records.
  const latestFull = sorted.filter((k) => new RegExp(`^${svc}-[0-9]{8}T.*-boot\\.log$`).test(k)).at(-1);
  // Reconciler failure captures: <svc>-failed-* (slot logs), <svc>-pull-failed-* (docker pull/auth stderr), <svc>-migrate-failed-* (one-shot migrator output).
  const failureKeys = sorted.filter((k) => new RegExp(`^${svc}-(pull-|migrate-)?failed-`).test(k)).slice(-5);
  return { markers, stageDetailKeys, latestFull, failureKeys };
}

/** Reads objects from the boot-diag prefix. Injectable so render() is testable. */
export interface DiagReader {
  /** Return raw `aws s3 ls` output for the boot-diag prefix. */
  list(): string;
  cat(key: string): string;
}

/**
 * True when an `aws s3 ls <prefix>` result means the prefix holds zero objects: the CLI exits 1 with no output at all.
 * That is a finding, not a listing failure; denied, bad-endpoint, and bad-bucket failures carry stderr and must still abort.
 */
export function isEmptyPrefixLs(status: number | null, stdout: string, stderr: string): boolean {
  return status === 1 && stdout.trim() === '' && stderr.trim() === '';
}

/** Guidance for an EMPTY boot-diag prefix: every boot uploads a transcript, so an empty prefix means no VM ever wrote a diagnostic object to the bucket. */
export function emptyBootDiagGuidance(slug = '<slug>'): string[] {
  return [
    'boot-diag is empty: no VM has ever uploaded diagnostics (every boot uploads, even a healthy one).',
    'Two known causes:',
    `  1. The boot runner never ran (cloud-init or launcher failure). Open the VM's serial console in the Scaleway web console and look for ::${slug}:: markers and "BOOT FAILED (exit N)".`,
    '  2. Uploads are denied: a boot principal provisioned before the IAM v2 model carries no Object Storage permission set, and Scaleway does not honor bucket-policy-only grants, so every boot-diag PUT fails. Re-run the infra CLI "Stack setup" apply with a bootstrap key; the current boot principal carries ObjectStorageObjectsWrite.',
  ];
}

/**
 * Read boot diagnostics through the AWS CLI. An empty prefix lists as '' (see isEmptyPrefixLs) and other listing errors abort.
 * Per-object errors are returned for inline rendering so one bad object does not hide the rest.
 */
export function createAwsReader(endpoint: string, bucket: string): DiagReader {
  const prefix = `s3://${bucket}/boot-diag/`;
  const spawnAws = (args: string[]) => spawnSync('aws', args, { encoding: 'utf-8' });
  const check = (res: ReturnType<typeof spawnAws>, what: string): string => {
    if (res.error) {
      if ((res.error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('aws CLI not found on PATH: install the AWS CLI to read boot diagnostics');
      }
      throw new Error(`aws ${what} failed: ${res.error.message}`);
    }
    if (res.status !== 0) {
      throw new Error(`aws ${what} exited ${res.status}: ${(res.stderr ?? '').trim() || '(no stderr)'}`);
    }
    return res.stdout ?? '';
  };
  return {
    list: () => {
      const res = spawnAws(['--endpoint-url', endpoint, 's3', 'ls', prefix]);
      if (!res.error && isEmptyPrefixLs(res.status, res.stdout ?? '', res.stderr ?? '')) return '';
      return check(res, `s3 ls ${prefix}`);
    },
    cat: (key) => check(spawnAws(['--endpoint-url', endpoint, 's3', 'cp', `${prefix}${key}`, '-']), `s3 cp ${key}`),
  };
}

/** Per-service rollup of what diagnostics exist, for the `--list` overview. */
export interface BundleSummary {
  service: string;
  /** Total boot-diag objects owned by this service. */
  total: number;
  /** How many of them are reconciler failure captures (the ones that matter). */
  failures: number;
  /** Latest full boot transcript key, if any. */
  latestFull?: string;
}

/** Summarise the boot-diag prefix per service, showing which services have evidence and which have a failure capture worth opening, without dumping every body. */
export function summarizeBundles(keys: string[], serviceNames: readonly string[]): BundleSummary[] {
  return serviceNames.map((service) => {
    const svc = escapeRe(service);
    const owned = keys.filter((k) => new RegExp(`^${svc}-`).test(k));
    const sel = selectDiagnostics(keys, service);
    return { service, total: owned.length, failures: sel.failureKeys.length, latestFull: sel.latestFull };
  });
}

/**
 * Print the selected diagnostics. `style` `'ci'` (default) emits GitHub Actions `::group::` log groups, `'plain'` emits section headers for a terminal.
 * A failed per-object read is annotated inline while the dump continues.
 */
export function renderDiagnostics(
  service: string,
  sel: DiagSelection,
  reader: DiagReader,
  log: (msg: string) => void = console.info,
  style: 'ci' | 'plain' = 'ci',
): void {
  const open = (title: string) => log(style === 'ci' ? `::group::${title}` : `\n=== ${title} ===`);
  const close = () => style === 'ci' && log('::endgroup::');
  const warn = (msg: string) => log(style === 'ci' ? `::warning::${msg}` : `! ${msg}`);
  const safeCat = (key: string): string => {
    try {
      return reader.cat(key);
    } catch (err) {
      return `<<failed to read ${key}: ${errorMessage(err)}>>`;
    }
  };

  const owned =
    (sel.failureKeys?.length ?? 0) + sel.markers.length + sel.stageDetailKeys.length + (sel.latestFull ? 1 : 0);
  if (owned === 0) {
    warn(`No boot diagnostics for ${service}: nothing was ever uploaded for this service`);
    return;
  }

  // Failure captures print before the boot transcript: the pull/auth error or failed slot's logs is usually the answer.
  for (const key of sel.failureKeys ?? []) {
    open(`⚠️ ${key}`);
    log(safeCat(key));
    close();
  }

  open(`Stage markers (${service}-*)`);
  for (const marker of sel.markers) log(marker);
  close();

  for (const key of sel.stageDetailKeys) {
    open(key);
    log(safeCat(key));
    close();
  }

  if (sel.latestFull) {
    open(`${service} boot diagnostics (${sel.latestFull})`);
    log(safeCat(sel.latestFull));
    close();
  } else {
    warn(`No ${service} full boot-diag log uploaded`);
  }
}

interface CliArgs {
  bucket: string;
  service: string;
  region: string;
}

/** Parse `--key value` flags. Exported for testing. */
export function parseArgs(argv: string[]): CliArgs {
  const bucket = getFlag(argv, '--bucket');
  const service = getFlag(argv, '--service');
  const region = getFlag(argv, '--region');
  if (!bucket || !service || !region) {
    throw new Error('Usage: fetch-boot-diag.ts --bucket <state-bucket> --service <name> --region <scw-region>');
  }
  return { bucket, service, region };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { bucket, service, region } = parseArgs(argv);
  const reader = createAwsReader(`https://s3.${region}.scw.cloud`, bucket);
  const keys = parseKeys(reader.list());
  if (keys.length === 0) {
    for (const line of emptyBootDiagGuidance()) console.info(line);
    return;
  }
  const selection = selectDiagnostics(keys, service);
  // CI gets collapsible groups; a manual local run gets plain headers.
  renderDiagnostics(service, selection, reader, console.info, process.env.GITHUB_ACTIONS === 'true' ? 'ci' : 'plain');
}

if (isMain(import.meta.url)) await main();
