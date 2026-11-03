import { GetObjectCommand, ListObjectsV2Command, ListObjectVersionsCommand, type S3Client } from '@aws-sdk/client-s3';
import { BOOT_ACCOUNTS_PREFIX } from './boot-accounts';
import {
  type Growth,
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
  /** A run's log read the same way. */
  readLog(run: string): Promise<Growth<string> | undefined>;
  /** A machine's boot account a record names, by its key under the boot accounts' prefix. */
  readBootAccount(key: string): Promise<string | undefined>;
}

/** A run store on the diagnostics bucket, read with any key the bucket admits to list and read versions (the observer's). */
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
  // Every version of one key in the order written, delete markers included: the bucket lists the newest first.
  const versions = async (key: string): Promise<StoredVersion<string>[]> => {
    const listed: { at: Date; versionId?: string; rank: number }[] = [];
    let marker: { KeyMarker?: string; VersionIdMarker?: string } = {};
    do {
      const page = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key, ...marker }));
      for (const version of page.Versions ?? [])
        if (version.Key === key && version.LastModified)
          listed.push({ at: version.LastModified, versionId: version.VersionId, rank: -listed.length });
      for (const deletion of page.DeleteMarkers ?? [])
        if (deletion.Key === key && deletion.LastModified) listed.push({ at: deletion.LastModified, rank: -listed.length });
      marker = page.IsTruncated ? { KeyMarker: page.NextKeyMarker, VersionIdMarker: page.NextVersionIdMarker } : {};
    } while (marker.KeyMarker);
    listed.sort((a, b) => a.at.getTime() - b.at.getTime() || a.rank - b.rank);
    return Promise.all(
      listed.map(async ({ at, versionId }) => ({ at: at.toISOString(), ...(versionId ? { body: await read(key, versionId) } : {}) })),
    );
  };
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
    async readRecord(run) {
      const stored = await versions(runRecordKey(run));
      return readByGrowth(
        stored.map(({ at, body }) => ({ at, ...(body ? { body: JSON.parse(body) as RunRecord } : {}) })),
        recordGrows,
      );
    },
    async readLog(run) {
      return readByGrowth(await versions(runLogKey(run)), logGrows);
    },
    readBootAccount: (key) => read(`${BOOT_ACCOUNTS_PREFIX}${key}`),
  };
}
