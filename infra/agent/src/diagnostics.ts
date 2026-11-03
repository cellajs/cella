import { readFile } from 'node:fs/promises';
import { type FetchLike, resolveFetch } from '../../lib/utils/fetch-like';

export interface UploadBootDiagnosticsOptions {
  /** The boot account's upload link, which the deploy signed for this machine's first boot. */
  url: string;
  service: string;
  releaseSha: string;
  bootRc: number;
  /** The boot phase that threw, and its error: they name a failed boot ahead of the log tail. */
  failedPhase?: string;
  failure?: string;
  logFile: string;
  appLogs?: string;
  /** Redaction by value (see secret-redactor.ts), applied to the uploaded account: boot log and app logs. */
  redact: (text: string) => string;
  fetchImpl?: FetchLike;
}

// Mirrors the cloud-init log scrub (lib/deploy/machine-user-data.ts) so both diagnostic channels drop the same secret-bearing lines.
const secretLinePattern = /SECRET|PASSWORD|API_KEY|DATABASE_URL|X-Amz-Signature/i;

/** Replace secret-bearing lines before a log leaves the machine, so a DSN or key printed on crash never reaches the boot-diag bucket or telemetry bodies. */
export function scrubSecretLines(text: string): string {
  return text
    .split('\n')
    .map((line) => (secretLinePattern.test(line) ? '[line scrubbed: matched secret pattern]' : line))
    .join('\n');
}

/** The boot log's tail that travels in the boot account: it accumulates every boot of the machine, and the newest lines name the failure. */
const bootLogTailChars = 256 * 1024;

/**
 * Read the machine's boot log, mounted read-only into the agent's container. The agent's own output is still being appended to it, so this takes
 * what is there now: one read, never a wait for the end.
 */
async function readBootLogTail(logFile: string): Promise<string> {
  try {
    const log = await readFile(logFile, 'utf-8');
    return log.length > bootLogTailChars ? `[earlier ${log.length - bootLogTailChars} characters cut]\n${log.slice(-bootLogTailChars)}` : log;
  } catch {
    return 'boot log not found\n';
  }
}

/** Upload the boot account through its link: the machine holds no key, and the link names the one object it may write. */
export async function uploadBootDiagnostics(opts: UploadBootDiagnosticsOptions): Promise<void> {
  const log = await readBootLogTail(opts.logFile);
  const parts = [`service=${opts.service}`, `release=${opts.releaseSha}`, `boot_rc=${opts.bootRc}`];
  if (opts.failedPhase) parts.push(`failed_phase=${opts.failedPhase}`);
  if (opts.failure?.trim()) parts.push('', '--- boot error ---', scrubSecretLines(opts.failure));
  parts.push('', scrubSecretLines(log));
  // The boot log holds the agent's and the release companion's output; the app containers log to Docker, so a crash is in their captured tail.
  if (opts.appLogs?.trim()) parts.push('', '--- app logs ---', scrubSecretLines(opts.appLogs));
  const body = opts.redact(parts.join('\n'));
  const res = await resolveFetch(opts.fetchImpl)(opts.url, { method: 'PUT', body, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  if (!res.ok) throw new Error(`boot account upload → ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
