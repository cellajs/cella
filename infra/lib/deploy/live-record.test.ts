import { describe, expect, it, vi } from 'vitest';
import { type LiveRecord, type LiveRole, liveRecordKey, parseLiveRecord, recordRole, rolesToReplace } from './live-record';

const commit = 'a'.repeat(40);
const entry = (over: Partial<LiveRole> = {}): LiveRole => ({ slot: 'a', machine: 'srv-1', commit, retry: 0, rotation: 0, ...over });
const record = (roles: Record<string, LiveRole>): LiveRecord => ({ schemaVersion: 1, roles });

/** One object honouring If-Match / If-None-Match; `race` writes another role's entry between a read and the write that follows it. */
function liveS3(initial?: LiveRecord, race?: LiveRecord) {
  let obj = initial ? { body: JSON.stringify(initial), etag: '"e1"' } : undefined;
  let counter = 1;
  let raced = !race;
  const fail412 = () => Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed' });
  const send = vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, string> }) => {
    if (cmd.constructor.name === 'GetObjectCommand') {
      if (!obj) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
      return { Body: { transformToString: async () => obj?.body ?? '' }, ETag: obj.etag };
    }
    if (!raced && race) {
      raced = true;
      obj = { body: JSON.stringify(race), etag: `"e${++counter}"` };
    }
    if (cmd.input.IfNoneMatch === '*' && obj) throw fail412();
    if (cmd.input.IfMatch && obj?.etag !== cmd.input.IfMatch) throw fail412();
    obj = { body: cmd.input.Body ?? '', etag: `"e${++counter}"` };
    return { ETag: obj.etag };
  });
  return { s3: { send }, read: () => parseLiveRecord(obj?.body ?? '') };
}

describe('the live record', () => {
  it('lives beside the lease, one per environment', () => {
    expect(liveRecordKey('organization/infra/production')).toBe('control/production/live.json');
  });

  it('keeps per role the slot that serves, its machine, its commit, and the retry and rotation it was booted under', () => {
    const live = record({ backend: entry(), cdc: entry({ slot: 'b', machine: 'srv-2', retry: 1, rotation: 2 }) });
    expect(parseLiveRecord(JSON.stringify(live))).toEqual(live);
    expect(() => parseLiveRecord(JSON.stringify(record({ backend: { ...entry(), slot: 'c' as 'a' } })))).toThrow(/slot/);
    expect(() => parseLiveRecord(JSON.stringify({ schemaVersion: 2, roles: {} }))).toThrow(/schemaVersion/);
    expect(() => parseLiveRecord(JSON.stringify(record({ backend: { ...entry(), commit: 'main' } })))).toThrow(/commit/);
  });

  it('decides `unchanged` only when every role serves the target under the same retry counter and rotation', () => {
    const live = record({ backend: entry(), frontend: entry({ machine: 'srv-3' }) });
    const roles = ['backend', 'frontend'];
    expect(rolesToReplace(live, roles, { commit, retry: 0, rotation: 0 })).toEqual([]);
    expect(rolesToReplace(live, roles, { commit: 'b'.repeat(40), retry: 0, rotation: 0 })).toEqual(roles);
    // A raised retry counter or a rotation since replaces every machine of the same commit.
    expect(rolesToReplace(live, roles, { commit, retry: 1, rotation: 0 })).toEqual(roles);
    expect(rolesToReplace(live, roles, { commit, retry: 0, rotation: 1 })).toEqual(roles);
    // A run that switched one role and failed resumes with the other.
    expect(rolesToReplace(record({ backend: entry() }), roles, { commit, retry: 0, rotation: 0 })).toEqual(['frontend']);
  });

  it('keeps a role another switch wrote between the read and the write, as roles switch concurrently', async () => {
    const { s3, read } = liveS3(record({ backend: entry() }), record({ backend: entry(), frontend: entry({ machine: 'srv-3' }) }));
    await recordRole(s3, 'b', 'production', 'cdc', entry({ slot: 'b', machine: 'srv-4' }), { by: 'job:test' });
    expect(Object.keys(read().roles).sort()).toEqual(['backend', 'cdc', 'frontend']);
    await recordRole(s3, 'b', 'production', 'backend', undefined, { by: 'job:test' });
    expect(Object.keys(read().roles).sort()).toEqual(['cdc', 'frontend']);
  });

  it('creates the first record create-only', async () => {
    const { s3, read } = liveS3();
    await recordRole(s3, 'b', 'production', 'backend', entry(), { by: 'job:test', now: () => new Date('2026-11-03T12:00:00Z') });
    expect(read()).toEqual({ ...record({ backend: entry() }), updatedAt: '2026-11-03T12:00:00.000Z', updatedBy: 'job:test' });
    expect(s3.send.mock.calls.at(-1)?.[0].input.IfNoneMatch).toBe('*');
  });
});
