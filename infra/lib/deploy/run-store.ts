import { GetObjectCommand, ListObjectsV2Command, ListObjectVersionsCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { BOOT_ACCOUNTS_PREFIX } from './boot-accounts';
import {
  type Growth,
  isRunRecord,
  logGrows,
  RUNS_PREFIX,
  type RunRecord,
  readByGrowth,
  recordGrows,
  runLogKey,
  runRecordKey,
  type StoredVersion,
} from './run-record';

/** The runs of an environment, as its diagnostics bucket keeps them. */
export interface RunStore {
  /** Run ids, newest first. */
  listRuns(limit: number): Promise<string[]>;
  /** A run's record read by its first version, with the version that broke its growth when one did. */
  readRecord(run: string): Promise<Growth<RunRecord> | undefined>;
  /** A run's record as it stands, read without its versions: what a key that reads no version (the deploy key) sees. */
  currentRecord(run: string): Promise<RunRecord | undefined>;
  /** A run's log read the same way. */
  readLog(run: string): Promise<Growth<string> | undefined>;
  /** A machine's boot account a record names, by its key under the boot accounts' prefix. */
  readBootAccount(key: string): Promise<string | undefined>;
}

/** A version's record, or undefined when its body is no record. */
function parseRecord(text: string): RunRecord | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isRunRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A run store on the diagnostics bucket. Reading a record or a log by its versions takes a key the bucket admits to list and read versions
 * (the observer's); the current record, one that lists and reads objects (the deploy key's).
 */
export function bucketRunStore(s3: Pick<S3Client, 'send'>, bucket: string): RunStore {
  const read = async (key: string, versionId?: string) => {
    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }));
      return await object.Body?.transformToString();
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return undefined;
      throw error;
    }
  };
  // One key's versions and delete markers in the order written. The bucket lists each newest first, so the two are merged newest first,
  // a marker before the version it deleted at the same moment, and the whole is reversed.
  const listVersions = async (key: string): Promise<{ at: Date; versionId?: string }[]> => {
    const listed: { at: Date; versionId?: string }[] = [];
    let marker: { KeyMarker?: string; VersionIdMarker?: string } = {};
    do {
      const page = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key, ...marker }));
      const versions = (page.Versions ?? []).filter((version) => version.Key === key && version.LastModified);
      const markers = (page.DeleteMarkers ?? []).filter((deletion) => deletion.Key === key && deletion.LastModified);
      for (let v = 0, m = 0; v < versions.length || m < markers.length; ) {
        const version = versions[v];
        const deletion = markers[m];
        const takeMarker = Boolean(deletion && (!version || (deletion.LastModified?.getTime() ?? 0) >= (version.LastModified?.getTime() ?? 0)));
        const entry = takeMarker ? markers[m++] : versions[v++];
        if (entry?.LastModified) listed.push({ at: entry.LastModified, ...(takeMarker ? {} : { versionId: entry.VersionId }) });
      }
      marker = page.IsTruncated ? { KeyMarker: page.NextKeyMarker, VersionIdMarker: page.NextVersionIdMarker } : {};
    } while (marker.KeyMarker);
    return listed.reverse();
  };
  // Each version's body is read when the one before it held, so a reading stops at the first break.
  async function* versions(key: string): AsyncGenerator<StoredVersion<string>> {
    for (const { at, versionId } of await listVersions(key)) {
      if (!versionId) {
        yield { at: at.toISOString() };
        continue;
      }
      const body = await read(key, versionId);
      yield body === undefined ? { at: at.toISOString(), fault: 'could not be read' } : { at: at.toISOString(), body };
    }
  }
  async function* records(run: string): AsyncGenerator<StoredVersion<RunRecord>> {
    for await (const { at, body, fault } of versions(runRecordKey(run))) {
      const record = body === undefined ? undefined : parseRecord(body);
      yield record ? { at, body: record } : { at, ...(body === undefined ? { fault } : { fault: 'is not a record' }) };
    }
  }
  return {
    async listRuns(limit) {
      const runs: string[] = [];
      let token: string | undefined;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: RUNS_PREFIX, Delimiter: '/', ContinuationToken: token }));
        for (const prefix of page.CommonPrefixes ?? []) if (prefix.Prefix) runs.push(prefix.Prefix.slice(RUNS_PREFIX.length).replace(/\/$/, ''));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      // Ids start with the time a run started, so the order of their names is the order of the runs.
      return runs.sort().reverse().slice(0, limit);
    },
    readRecord: (run) => readByGrowth(records(run), recordGrows, 'the record'),
    currentRecord: async (run) => {
      const body = await read(runRecordKey(run));
      return body === undefined ? undefined : parseRecord(body);
    },
    readLog: (run) => readByGrowth(versions(runLogKey(run)), logGrows, 'the log'),
    readBootAccount: (key) => read(`${BOOT_ACCOUNTS_PREFIX}${key}`),
  };
}

/** The current records of the runs that deployed a commit, found by the commit each run's id ends with (`runId`). */
export async function commitRecords(store: Pick<RunStore, 'listRuns' | 'currentRecord'>, sha: string): Promise<RunRecord[]> {
  const runs = (await store.listRuns(Number.POSITIVE_INFINITY)).filter((run) => run.endsWith(`-${sha.slice(0, 10)}`));
  const records = await Promise.all(runs.map((run) => store.currentRecord(run)));
  return records.filter((record): record is RunRecord => record !== undefined);
}

/** Write a run's record, as the deploy writes it after every step and a scheduled run when it opens the record of the deploy it starts. */
export async function putRunRecord(s3: Pick<S3Client, 'send'>, bucket: string, record: RunRecord): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: runRecordKey(record.run), Body: JSON.stringify(record, null, 2), ContentType: 'application/json' }),
  );
}
