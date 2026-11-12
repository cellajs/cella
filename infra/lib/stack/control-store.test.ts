import { describe, expect, it, vi } from 'vitest';
import { makeLockS3 } from '../../tests/helpers/fake-lock-s3';
import {
  acquireLock,
  forceUnlock,
  handOverLock,
  type LockInfo,
  lockKey,
  parseRotations,
  pruneLockVersions,
  readObjectEtag,
  recordRotation,
  releaseLock,
  rotationsKey,
  stateBucket,
  withRotation,
} from './control-store';

/** Mock S3 client dispatching on command constructor name, mirroring
 *  ensure-state-bucket.test.ts. GET pops from `get`, PUT records inputs. */
function makeS3(opts: { get?: Array<{ body?: string; etag?: string } | { status: number } | { name: string }>; putEtag?: string }) {
  const getQueue = [...(opts.get ?? [])];
  const puts: Array<Record<string, unknown>> = [];
  const send = vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const kind = cmd.constructor.name;
    if (kind === 'GetObjectCommand') {
      const r = getQueue.shift();
      if (r === undefined) throw new Error('no more GET responses queued');
      if ('status' in r) throw Object.assign(new Error('get error'), { $metadata: { httpStatusCode: r.status } });
      if ('name' in r) throw Object.assign(new Error(r.name), { name: r.name });
      return { Body: r.body === undefined ? undefined : { transformToString: async () => r.body }, ETag: r.etag };
    }
    if (kind === 'PutObjectCommand') {
      puts.push(cmd.input);
      return { ETag: opts.putEtag };
    }
    throw new Error(`unexpected command ${kind}`);
  });
  return { s3: { send } as any, puts };
}

describe('control-store keys', () => {
  it('derives the state bucket from the slug', () => {
    expect(stateBucket('cella')).toBe('cella-pulumi-state');
  });

  it("keeps an environment's control records in one folder, from a full or bare stack name", () => {
    expect(lockKey('organization/infra/production')).toBe('control/production/lock.json');
    expect(rotationsKey('staging')).toBe('control/staging/rotations.json');
  });
});

/** Stateful single-object S3 mock honouring If-None-Match/If-Match preconditions,
 *  so the lock's create-if-absent and stale-break paths are exercised for real. */

describe('acquireLock / releaseLock', () => {
  const opts = { owner: 'operator:a', operation: 'apply', ttlMs: 60_000, now: 1_000_000 };

  it('acquires when no lock exists', async () => {
    const { s3, current } = makeLockS3();
    const res = await acquireLock(s3, 'b', 'k', opts);
    expect(res.acquired).toBe(true);
    expect(current()).toBeDefined();
  });

  it('refuses when a live lock is held by someone else', async () => {
    const held: LockInfo = { owner: 'operator:b', operation: 'deploy', acquiredAt: '', expiresAt: new Date(2_000_000).toISOString() };
    const { s3 } = makeLockS3(held);
    const res = await acquireLock(s3, 'b', 'k', opts);
    expect(res.acquired).toBe(false);
    if (!res.acquired) expect(res.held.owner).toBe('operator:b');
  });

  it('breaks and takes an expired lock', async () => {
    const expired: LockInfo = { owner: 'operator:b', operation: 'deploy', acquiredAt: '', expiresAt: new Date(500_000).toISOString() };
    const { s3, current } = makeLockS3(expired);
    const res = await acquireLock(s3, 'b', 'k', opts);
    expect(res.acquired).toBe(true);
    expect(JSON.parse(current()!.body).owner).toBe('operator:a');
  });

  it("hands a scheduled run's lease to its deploy, which takes it over at once; the same owner without adopt, a second session of one person, waits", async () => {
    const { s3, current } = makeLockS3();
    const looking = { owner: 'run:20261106T120000Z', operation: 'scheduled run', ttlMs: 60_000, now: 1_000_000 };
    expect((await acquireLock(s3, 'b', 'k', looking)).acquired).toBe(true);
    const deploy = 'run:20261106T120000Z-aaaaaaaaaa';
    expect(await handOverLock(s3, 'b', 'k', { from: 'run:someone-else', to: deploy, operation: 'deploy', ttlMs: 60_000 })).toBe(false);
    expect(await handOverLock(s3, 'b', 'k', { from: looking.owner, to: deploy, operation: 'deploy', ttlMs: 60_000, now: 1_000_000 })).toBe(true);
    expect(JSON.parse(current()!.body)).toMatchObject({ owner: deploy, operation: 'deploy' });
    const child = { owner: deploy, operation: 'deploy', ttlMs: 60_000, now: 1_001_000 };
    expect((await acquireLock(s3, 'b', 'k', child)).acquired).toBe(false);
    expect((await acquireLock(s3, 'b', 'k', { ...child, adopt: true })).acquired).toBe(true);
  });

  it('release removes our own lock', async () => {
    const { s3, current } = makeLockS3();
    await acquireLock(s3, 'b', 'k', opts);
    await releaseLock(s3, 'b', 'k', 'operator:a');
    expect(current()).toBeUndefined();
  });

  it('release leaves a lock owned by someone else', async () => {
    const other: LockInfo = { owner: 'operator:b', operation: 'deploy', acquiredAt: '', expiresAt: new Date(2_000_000).toISOString() };
    const { s3, current } = makeLockS3(other);
    await releaseLock(s3, 'b', 'k', 'operator:a');
    expect(current()).toBeDefined();
  });

  it('forceUnlock removes any lock and returns its info', async () => {
    const other: LockInfo = { owner: 'operator:b', operation: 'deploy', acquiredAt: '', expiresAt: new Date(2_000_000).toISOString() };
    const { s3, current } = makeLockS3(other);
    const info = await forceUnlock(s3, 'b', 'k');
    expect(info?.owner).toBe('operator:b');
    expect(current()).toBeUndefined();
  });
});

describe('rotations', () => {
  it('raises the counter at every rotation, of either kind, and keeps the last record of the other', () => {
    const once = withRotation({ counter: 0 }, 'keys', { at: 'a', by: 'x' });
    const twice = withRotation(once, 'secrets', { at: 'b', by: 'y' });
    expect(twice).toEqual({ counter: 2, keys: { at: 'a', by: 'x' }, secrets: { at: 'b', by: 'y' } });
    expect(parseRotations(JSON.stringify(twice))).toEqual(twice);
  });

  it('writes the rotation conditional on the object it read, so a racing write fails loudly', async () => {
    const { s3, puts } = makeS3({ get: [{ body: JSON.stringify({ counter: 1 }), etag: '"e1"' }] });
    const rotations = await recordRotation({
      s3,
      bucket: 'b',
      stack: 'organization/infra/staging',
      kind: 'secrets',
      by: 'operator:flip',
      now: new Date('2026-10-14T10:00:00Z'),
    });
    expect(rotations).toEqual({ counter: 2, secrets: { at: '2026-10-14T10:00:00.000Z', by: 'operator:flip' } });
    expect(puts[0]!.IfMatch).toBe('"e1"');
    expect(puts[0]!.Key).toBe('control/staging/rotations.json');
  });

  it('creates the first rotation create-only', async () => {
    const { s3, puts } = makeS3({ get: [{ status: 404 }] });
    await recordRotation({ s3, bucket: 'b', stack: 'production', kind: 'keys', by: 'operator:flip' });
    expect(puts[0]!.IfNoneMatch).toBe('*');
  });
});

describe('readObjectEtag', () => {
  it('must not let an unreadable checkpoint pass for an unchanged one: one HEAD of the given object, no body, and a refused read throws', async () => {
    const sent: Array<{ command: string; input: unknown }> = [];
    const head = (error?: Error) => ({
      send: async (command: unknown) => {
        const sentCommand = command as { constructor: { name: string }; input: unknown };
        sent.push({ command: sentCommand.constructor.name, input: sentCommand.input });
        if (error) throw error;
        return { ETag: '"aaa"' };
      },
    });
    expect(await readObjectEtag(head(), 'state', '.pulumi/stacks/infra/production.json')).toBe('"aaa"');
    expect(sent).toEqual([{ command: 'HeadObjectCommand', input: { Bucket: 'state', Key: '.pulumi/stacks/infra/production.json' } }]);
    const denied = Object.assign(new Error('access denied'), { name: 'AccessDenied' });
    await expect(readObjectEtag(head(denied), 'state', '.pulumi/stacks/infra/production.json')).rejects.toThrow('access denied');
  });
});

describe("the lease's versions", () => {
  const key = lockKey('production');
  type Entry = { VersionId: string; marker: boolean };
  /** A versioned bucket holding one key, newest entry first, that lists two entries a call. */
  const versioned = (entries: Entry[]) => {
    let held = [...entries];
    const s3 = {
      send: async (command: unknown) => {
        const sent = command as { constructor: { name: string }; input: { VersionId?: string } };
        const { input } = sent;
        if (sent.constructor.name === 'ListObjectVersionsCommand') {
          const page = held.slice(0, 2).map((entry) => ({ ...entry, Key: key, IsLatest: entry === held[0] }));
          return { Versions: page.filter((entry) => !entry.marker), DeleteMarkers: page.filter((entry) => entry.marker) };
        }
        held = held.filter((entry) => entry.VersionId !== input.VersionId);
        return {};
      },
    };
    return { s3, held: () => held.map((entry) => entry.VersionId) };
  };

  // Deleting the newest entry would change who holds the lease: a delete marker gone makes the version below it the lease again.
  it.each([
    { case: 'a lease that stands', newest: { VersionId: 'v5', marker: false } },
    { case: 'a released lease, a delete marker', newest: { VersionId: 'm5', marker: true } },
  ])('are deleted down to the newest entry: $case', async ({ newest }) => {
    const bucket = versioned([
      newest,
      { VersionId: 'm4', marker: true },
      { VersionId: 'v3', marker: false },
      { VersionId: 'm2', marker: true },
      { VersionId: 'v1', marker: false },
    ]);
    expect(await pruneLockVersions(bucket.s3, 'bucket', key)).toBe(4);
    expect(bucket.held()).toEqual([newest.VersionId]);
  });
});
