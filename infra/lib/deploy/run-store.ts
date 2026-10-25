import { GetObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { BOOT_ACCOUNTS_PREFIX } from './boot-accounts';
import { RUNS_PREFIX, type RunRecord, runLogKey, runRecordKey } from './run-record';

/** The runs of an environment, as its diagnostics bucket keeps them. */
export interface RunStore {
  /** Run ids, newest first. */
  listRuns(limit: number): Promise<string[]>;
  readRecord(run: string): Promise<RunRecord | undefined>;
  readLog(run: string): Promise<string | undefined>;
  /** A machine's boot account a record names, by its key under the boot accounts' prefix. */
  readBootAccount(key: string): Promise<string | undefined>;
}

/** A run store on the diagnostics bucket, read with any key the bucket admits to read (the observer's). */
export function bucketRunStore(s3: Pick<S3Client, 'send'>, bucket: string): RunStore {
  const read = async (key: string) => {
    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return await object.Body?.transformToString();
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return undefined;
      throw error;
    }
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
      const text = await read(runRecordKey(run));
      return text ? (JSON.parse(text) as RunRecord) : undefined;
    },
    readLog: (run) => read(runLogKey(run)),
    readBootAccount: (key) => read(`${BOOT_ACCOUNTS_PREFIX}${key}`),
  };
}
