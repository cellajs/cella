import { readFile } from 'node:fs/promises';
import { type FetchLike, resolveFetch } from '../../lib/utils/fetch-like';
import { retry } from '../../lib/utils/retry';
import { writeFileMode } from './fs-utils';

/** Ceiling on one fetch of the env file, a few kilobytes: a stalled one fails and is retried. */
const fetchAttemptTimeoutSeconds = 60;

/** The values of an env file, one `NAME=value` per line, so the agent redacts each wherever it shows up. */
export function envFileValues(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.slice(line.indexOf('=') + 1))
    .filter((value, index, all) => value !== '' && all.indexOf(value) === index);
}

/**
 * The machine's env file: the one at `outputPath` when an earlier boot of this machine fetched it, else the one its link serves, kept there
 * at 0600 for every boot after. The deploy composed it; the link ends within minutes and is gone from the user data after the first boot.
 */
export async function fetchRuntimeEnv(opts: {
  url: string;
  outputPath: string;
  attempts: number;
  retryDelayMs: number;
  fetchImpl?: FetchLike;
}): Promise<{ content: string; fetched: boolean }> {
  const kept = await readFile(opts.outputPath, 'utf-8').catch(() => undefined);
  if (kept !== undefined) return { content: kept, fetched: false };
  const fetchImpl = resolveFetch(opts.fetchImpl);
  const content = await retry(
    async () => {
      const res = await fetchImpl(opts.url, { method: 'GET', signal: AbortSignal.timeout(fetchAttemptTimeoutSeconds * 1000) });
      if (!res.ok) throw new Error(`the env file's link answered ${res.status}`);
      return res.text();
    },
    { attempts: opts.attempts, delayMs: opts.retryDelayMs },
  );
  await writeFileMode(opts.outputPath, content, 0o600);
  return { content, fetched: true };
}
