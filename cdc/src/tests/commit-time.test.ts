import { PgoutputPlugin } from 'pg-logical-replication';
import { describe, expect, it } from 'vitest';
import { commitTimeMs } from '../utils/commit-time';

/** A BEGIN message as Postgres writes it: 'B', the commit LSN, the commit time in microseconds since 2000-01-01, the xid. */
function beginFrame(committedAt: Date): Buffer {
  const frame = Buffer.alloc(21);
  frame.write('B', 0);
  frame.writeBigUInt64BE(0x16b3748n, 1);
  frame.writeBigUInt64BE(BigInt(committedAt.getTime() - Date.UTC(2000, 0, 1)) * 1000n, 9);
  frame.writeInt32BE(742, 17);
  return frame;
}

describe('commitTimeMs', () => {
  it('reads the commit time of a BEGIN message as the replication client parses it', () => {
    const committedAt = new Date('2026-10-09T08:15:30.123Z');
    const parsed = new PgoutputPlugin({ protoVersion: 1, publicationNames: ['cdc_pub'] }).parse(beginFrame(committedAt));

    if (parsed.tag !== 'begin') throw new Error(`Parsed a ${parsed.tag} message`);
    expect(commitTimeMs(parsed)).toBe(committedAt.getTime());
  });

  it('has no time for a message without one', () => {
    expect(commitTimeMs({ tag: 'begin', xid: 1, commitLsn: null, commitTime: BigInt(0) })).toBeNull();
  });
});
