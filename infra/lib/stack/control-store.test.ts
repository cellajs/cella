import { describe, expect, it, vi } from 'vitest';
import { makeLockS3 } from '../../tests/helpers/fake-lock-s3';
import {
  acquireLock,
  forceUnlock,
  type LockInfo,
  lockKey,
  parseRotations,
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

  it("keeps an environment's control objects in one folder, from a full or bare stack name", () => {
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
