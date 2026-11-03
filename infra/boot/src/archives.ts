import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { retry } from '../../lib/utils/retry';
import { type ExecFn, mustExec } from './exec';
import type { ReleaseArchive } from './plan';

/** Ceiling on one `docker load` of an archive: the backend image loads in well under a minute. */
const loadTimeoutSeconds = 600;

/** Ceiling on one fetch of an archive, body included: a stalled transfer fails and is retried. A cold backend archive takes well under a minute. */
const fetchAttemptTimeoutSeconds = 240;

/** Fetch one archive to `path`, returning the sha256 of what arrived. */
async function download(url: string, path: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(fetchAttemptTimeoutSeconds * 1000) });
  if (!res.ok || !res.body) throw new Error(`the archive's link answered ${res.status}`);
  const hash = createHash('sha256');
  const hashing = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      done(null, chunk);
    },
  });
  // The DOM and Node stream types name one runtime object.
  await pipeline(Readable.fromWeb(res.body as ReadableStream<Uint8Array>), hashing, createWriteStream(path, { mode: 0o600 }));
  return hash.digest('hex');
}

/**
 * Load the release's images from their archives into the Docker daemon. An image the daemon holds already, as after a reboot, is not fetched
 * again. An archive whose sha256 differs from the one the deploy put in the plan is refused and deleted before Docker reads it: whoever could
 * replace an archive in the bucket cannot choose what this machine runs.
 * @throws on a link that fails every attempt, a digest that differs, or a load that fails
 */
export async function loadArchives(opts: {
  archives: readonly ReleaseArchive[];
  dir: string;
  exec: ExecFn;
  attempts: number;
  retryDelayMs: number;
  log: (message: string) => void;
}): Promise<void> {
  for (const archive of opts.archives) {
    const present = await opts.exec('docker', ['image', 'inspect', '--format', '{{.Id}}', archive.image], { timeoutMs: 60_000 });
    if (present.code === 0) {
      opts.log(`${archive.name}: ${archive.image} is loaded`);
      continue;
    }
    const path = join(opts.dir, `${archive.name}.tar`);
    await mkdir(opts.dir, { recursive: true });
    try {
      const sha256 = await retry(() => download(archive.url, path), { attempts: opts.attempts, delayMs: opts.retryDelayMs });
      if (sha256 !== archive.sha256)
        throw new Error(`the archive ${archive.name} differs from its digest (${sha256}, not ${archive.sha256}): refused`);
      await mustExec(opts.exec, 'docker', ['load', '--quiet', '--input', path], { timeoutMs: loadTimeoutSeconds * 1000 });
      opts.log(`${archive.name}: loaded ${archive.image}`);
    } finally {
      await rm(path, { force: true });
    }
  }
}
