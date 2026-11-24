import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAppliedEngine } from '../../lib/deploy/applied-engine';
import { readLiveRecord } from '../../lib/deploy/live-record';
import { isRunRecord } from '../../lib/deploy/run-record';
import { peekLock, readRotations, type S3Like } from '../../lib/stack/control-store';

const fixtures = resolve(__dirname, '../fixtures');

/** A bucket that answers every read with one stored body. */
const bucketOf = (body: string): S3Like => ({ send: async () => ({ Body: { transformToString: async () => body }, ETag: '"e"' }) });

// An environment's bucket holds records an earlier engine wrote, and the main job runs the applied engine, which may be older than the CLI
// reading beside it. A release that changes a record's shape adds a folder of that release's records; a folder is never edited.
describe.each(readdirSync(fixtures).filter((name) => name.startsWith('records-')))('the control records of %s', (release) => {
  const read = (name: string) => readFileSync(resolve(fixtures, release, name), 'utf8');

  it('are read by this engine: the live record, the lease, the rotations, the applied engine and a run record', async () => {
    expect(Object.keys((await readLiveRecord(bucketOf(read('live.json')), 'b', 'production')).record.roles)).toEqual(['backend', 'cdc']);
    expect(await peekLock(bucketOf(read('lock.json')), 'b', 'k')).toMatchObject({ owner: 'run:20261120T100000Z-0123456789', operation: 'deploy' });
    expect((await readRotations(bucketOf(read('rotations.json')), 'b', 'production')).rotations.counter).toBe(2);
    expect((await readAppliedEngine(bucketOf(read('applied.json')), 'b', 'production'))?.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(isRunRecord(JSON.parse(read('record.json')))).toBe(true);
  });
});
