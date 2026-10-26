import { GetObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';

/**
 * A machine's own account of a boot (plan §3.8): the boot runner uploads it at the end of every boot, healthy or not, to the diagnostics
 * bucket as `boot-diag/<service>-<YYYYMMDDThhmmssZ>-boot.log`, headed by `service=`, `release=` and `boot_rc=` lines. A failed boot adds a
 * `-failed-` copy and every boot its telemetry events beside it (`-events.jsonl`).
 */
export const BOOT_ACCOUNTS_PREFIX = 'boot-diag/';

/** Reads the boot accounts of an environment's diagnostics bucket: keys under the prefix, without it. */
export interface BootAccountReader {
  list(): Promise<string[]>;
  read(key: string): Promise<string>;
}

/** A reader on the diagnostics bucket, with any key the bucket admits to read: the observer's, or the deploy's in a run. */
export function bucketBootAccountReader(s3: Pick<S3Client, 'send'>, bucket: string): BootAccountReader {
  return {
    async list() {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: BOOT_ACCOUNTS_PREFIX, ContinuationToken: token }));
        for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key.slice(BOOT_ACCOUNTS_PREFIX.length));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
    async read(key) {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `${BOOT_ACCOUNTS_PREFIX}${key}` }));
      return (await object.Body?.transformToString()) ?? '';
    },
  };
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A service's boot accounts, newest first. Keys sort by their time stamp. */
export function serviceAccountKeys(keys: readonly string[], service: string): string[] {
  const pattern = new RegExp(`^${escapeRe(service)}-[0-9]{8}T[0-9]{6}Z?-boot\\.log$`);
  return keys
    .filter((key) => pattern.test(key))
    .sort()
    .reverse();
}

/** The release an account names on its `release=` line. */
function accountRelease(body: string): string | undefined {
  return /^release=(\S+)$/m.exec(body)?.[1];
}

/** True when the account's boot failed. */
export function accountFailed(body: string): boolean {
  return /^boot_rc=([1-9][0-9]*)$/m.test(body);
}

/** One service's account of a release: the newest one, or none, with the newest account of another release named only. */
export interface ReleaseAccount {
  service: string;
  account?: { key: string; body: string; failed: boolean };
  newestOther?: { key: string; release?: string };
}

/**
 * Each service's newest account of release `sha` (may be abbreviated), reading at most `maxScan` of its newest accounts, as keys carry no
 * release. An account of another release is never taken for this one: on a failed rollout it reads like this deploy's boot and hides that
 * the new machine never reported. An account that cannot be read is skipped.
 */
export async function releaseAccounts(reader: BootAccountReader, services: readonly string[], sha: string, maxScan = 8): Promise<ReleaseAccount[]> {
  const keys = await reader.list();
  return Promise.all(
    services.map(async (service) => {
      const found: ReleaseAccount = { service };
      for (const key of serviceAccountKeys(keys, service).slice(0, maxScan)) {
        const body = await reader.read(key).catch(() => undefined);
        if (body === undefined) continue;
        const release = accountRelease(body);
        if (release?.startsWith(sha)) {
          found.account = { key, body, failed: accountFailed(body) };
          break;
        }
        found.newestOther ??= { key, release };
      }
      return found;
    }),
  );
}

/** What a person reads first of a failed account: the error the boot runner wrote, then the end of its log. */
export function accountExcerpt(body: string, lines = 30): string[] {
  const error = /--- boot error ---\n([\s\S]*?)(?:\n\n|$)/.exec(body)?.[1]?.trim();
  const tail = body.trimEnd().split('\n').slice(-lines);
  return [...(error ? ['boot error:', ...error.split('\n'), ''] : []), ...tail];
}
