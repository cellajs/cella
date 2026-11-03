import { extname } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import type { S3Client } from '@aws-sdk/client-s3';
import { type RdbClient, waitForBackupReady } from '../lib/scaleway/scaleway-rdb';

/** The prefix of the boot-diag bucket that holds the final dumps, one folder per environment. */
export const DUMPS_PREFIX = 'dumps/';

/** Days Scaleway keeps the backup a dump is exported from, as a second copy. */
const BACKUP_RETENTION_DAYS = 7;

/** A backup and an export of a large database take longer than a reset's backup. */
const DUMP_TIMEOUT_MS = 30 * 60_000;

export interface FinalDumpOptions {
  rdb: Pick<RdbClient, 'findInstance' | 'createBackup' | 'getBackup' | 'exportBackup'>;
  instanceName: string;
  databaseName: string;
  environment: string;
  /** The boot-diag bucket, which every environment has and a teardown keeps, written with a client whose key its policy admits. */
  bucket: string;
  s3: S3Client;
  download?: typeof fetch;
  now?: Date;
  log: (message: string) => void;
}

/**
 * Write a final dump of the environment's database into the boot-diag bucket, before a teardown deletes the instance: a backup made through
 * the managed database's API, exported, and streamed from its download link to `dumps/<environment>/<time><ext>`, the extension being the
 * exported file's (`.dump` when its link names none). No statement of the bucket's policy lets the uploads key or the observer read there.
 * @returns the object's key, or undefined when the environment has no managed database instance.
 * @throws when the backup, its export or the upload fails: the teardown then destroys nothing.
 */
export async function writeFinalDump(opts: FinalDumpOptions): Promise<string | undefined> {
  const instance = await opts.rdb.findInstance(opts.instanceName);
  if (!instance) return undefined;
  const now = opts.now ?? new Date();
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  opts.log(`Backing up ${opts.databaseName} on ${opts.instanceName}...`);
  const created = await opts.rdb.createBackup({
    instanceId: instance.id,
    databaseName: opts.databaseName,
    name: `${opts.databaseName}-final-${stamp.replaceAll(':', '-')}`,
    expiresAt: new Date(now.getTime() + BACKUP_RETENTION_DAYS * 86_400_000).toISOString(),
  });
  await waitForBackupReady(opts.rdb, created.id, { timeoutMs: DUMP_TIMEOUT_MS });
  opts.log('Exporting the backup...');
  await opts.rdb.exportBackup(created.id);
  const exported = await waitForBackupReady(opts.rdb, created.id, { timeoutMs: DUMP_TIMEOUT_MS, downloadable: true });
  const url = exported.download_url ?? '';

  const response = await (opts.download ?? fetch)(url);
  const length = Number(response.headers.get('content-length'));
  if (!response.ok || !response.body || !(length > 0)) {
    throw new Error(`the backup's download link answered ${response.status}${response.ok ? ' without a length' : ''}`);
  }
  const key = `${DUMPS_PREFIX}${opts.environment}/${stamp}${extname(new URL(url).pathname) || '.dump'}`;
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  await opts.s3.send(
    new PutObjectCommand({
      Bucket: opts.bucket,
      Key: key,
      // fetch's body is typed by the DOM library, and node:stream/web names the same object.
      Body: Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      ContentLength: length,
      ContentType: 'application/octet-stream',
    }),
  );
  opts.log(`Final dump written: ${opts.bucket}/${key} (${Math.ceil(length / 1_048_576)} MiB).`);
  return key;
}
