import { GetObjectCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import type { RunRecord } from './run-record';
import { bucketRunStore } from './run-store';

const record: RunRecord = {
  run: '20261015T000000Z-bbbbbbbbbb',
  environment: 'staging',
  target: 'b'.repeat(40),
  startedAt: '2026-10-15T00:00:00.000Z',
  outcome: 'running',
  steps: [],
};
const key = 'runs/20261015T000000Z-bbbbbbbbbb/record.json';

/** A bucket holding versions of one record, listed newest first as Object Storage does, counting the bodies it hands out. */
function bucket(versions: { id: string; at: string; body?: string }[], markers: { at: string }[] = []) {
  const reads: string[] = [];
  const s3 = {
    send: async (command: unknown) => {
      if (command instanceof ListObjectVersionsCommand) {
        return {
          Versions: [...versions].reverse().map((version) => ({ Key: key, VersionId: version.id, LastModified: new Date(version.at) })),
          DeleteMarkers: [...markers].reverse().map((marker) => ({ Key: key, LastModified: new Date(marker.at) })),
        };
      }
      if (command instanceof GetObjectCommand) {
        reads.push(String(command.input.VersionId));
        const body = versions.find((version) => version.id === command.input.VersionId)?.body ?? '';
        return { Body: { transformToString: async () => body } };
      }
      throw new Error('unexpected command');
    },
  };
  return { store: bucketRunStore(s3, 'diag'), reads };
}

describe('the bucket run store', () => {
  it('must not let a version that is no record fail the listing: it is the rewrite, and no version after it is read', async () => {
    const grown = { ...record, steps: [{ title: 'Build the release', seconds: 120, outcome: 'ok' as const }] };
    const { store, reads } = bucket([
      { id: 'v1', at: '2026-10-15T00:00:00Z', body: JSON.stringify(record) },
      { id: 'v2', at: '2026-10-15T00:02:00Z', body: '{"run": "x"' },
      { id: 'v3', at: '2026-10-15T00:03:00Z', body: JSON.stringify({ hello: 'world' }) },
      { id: 'v4', at: '2026-10-15T00:04:00Z', body: JSON.stringify(grown) },
    ]);
    expect(await store.readRecord(record.run)).toEqual({ newest: record, rewrite: { at: '2026-10-15T00:02:00.000Z', detail: 'is not a record' } });
    expect(reads).toEqual(['v1', 'v2']);
  });

  it('orders a delete marker after the version written in the same second, and a version after a marker it followed', async () => {
    const grown = { ...record, steps: [{ title: 'Build the release', seconds: 120, outcome: 'ok' as const }] };
    const same = bucket(
      [
        { id: 'v1', at: '2026-10-15T00:00:00Z', body: JSON.stringify(record) },
        { id: 'v2', at: '2026-10-15T00:02:00Z', body: JSON.stringify(grown) },
      ],
      [{ at: '2026-10-15T00:02:00Z' }],
    );
    expect(await same.store.readRecord(record.run)).toEqual({
      newest: grown,
      rewrite: { at: '2026-10-15T00:02:00.000Z', detail: 'deleted the record' },
    });
    const recreated = bucket(
      [
        { id: 'v1', at: '2026-10-15T00:00:00Z', body: JSON.stringify(record) },
        { id: 'v2', at: '2026-10-15T00:03:00Z', body: JSON.stringify(grown) },
      ],
      [{ at: '2026-10-15T00:02:00Z' }],
    );
    expect(await recreated.store.readRecord(record.run)).toEqual({
      newest: record,
      rewrite: { at: '2026-10-15T00:02:00.000Z', detail: 'deleted the record' },
    });
    expect(recreated.reads).toEqual(['v1']);
  });
});
