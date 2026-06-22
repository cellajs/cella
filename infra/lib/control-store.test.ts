import { describe, expect, it, vi } from 'vitest'
import {
  acquireLock,
  type ControlState,
  controlKey,
  emptyControlState,
  emptyRollout,
  forceUnlock,
  type LockInfo,
  lockKey,
  parseControlState,
  promote,
  readControlState,
  releaseLock,
  rollback,
  serializeControlState,
  setPending,
  stateBucket,
  writeControlState,
} from './control-store'

/** Mock S3 client dispatching on command constructor name, mirroring
 *  ensure-state-bucket.test.ts. GET pops from `get`, PUT records inputs. */
function makeS3(opts: {
  get?: Array<{ body?: string; etag?: string } | { status: number } | { name: string }>
  putEtag?: string
}) {
  const getQueue = [...(opts.get ?? [])]
  const puts: Array<Record<string, unknown>> = []
  const send = vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const kind = cmd.constructor.name
    if (kind === 'GetObjectCommand') {
      const r = getQueue.shift()
      if (r === undefined) throw new Error('no more GET responses queued')
      if ('status' in r) throw Object.assign(new Error('get error'), { $metadata: { httpStatusCode: r.status } })
      if ('name' in r) throw Object.assign(new Error(r.name), { name: r.name })
      return { Body: r.body === undefined ? undefined : { transformToString: async () => r.body }, ETag: r.etag }
    }
    if (kind === 'PutObjectCommand') {
      puts.push(cmd.input)
      return { ETag: opts.putEtag }
    }
    throw new Error(`unexpected command ${kind}`)
  })
  // biome-ignore lint/suspicious/noExplicitAny: minimal mock surface
  return { s3: { send } as any, puts }
}

describe('control-store keys', () => {
  it('derives the state bucket from the slug', () => {
    expect(stateBucket('cella')).toBe('cella-pulumi-state')
  })

  it('derives the control key from a full or bare stack name', () => {
    expect(controlKey('organization/infra/production')).toBe('control/production.json')
    expect(controlKey('production')).toBe('control/production.json')
  })
})

describe('parse/serialize', () => {
  it('round-trips a populated state', () => {
    const state: ControlState = {
      schemaVersion: 2,
      bootstrap: { completedAt: '2026-06-20T00:00:00Z' },
      rollout: {
        backend: { seq: 6, active: { id: 'aa11', sha: 'abc', seq: 5 }, previous: { id: 'bb22', sha: 'old', seq: 4 }, pendingSha: 'def' },
        cdc: { seq: 2, active: { id: 'cc33', sha: 'abc', seq: 2 } },
      },
      updatedAt: '2026-06-20T01:00:00Z',
      updatedBy: 'ci:run-512',
    }
    expect(parseControlState(serializeControlState(state))).toEqual(state)
  })

  it('accepts a minimal document', () => {
    expect(parseControlState('{"schemaVersion":2}')).toEqual(emptyControlState())
  })

  it('rejects invalid JSON', () => {
    expect(() => parseControlState('{nope')).toThrow(/not valid JSON/)
  })

  it('rejects an unsupported schema version', () => {
    expect(() => parseControlState('{"schemaVersion":1}')).toThrow(/unsupported schemaVersion/)
  })

  it('rejects a malformed rollout entry', () => {
    expect(() => parseControlState('{"schemaVersion":2,"rollout":{"backend":{"active":{"id":"x","sha":"y","seq":1}}}}')).toThrow(/rollout\['backend'\].seq/)
  })
})

describe('readControlState', () => {
  it('parses an existing object and returns its etag', async () => {
    const { s3 } = makeS3({ get: [{ body: '{"schemaVersion":2,"rollout":{"backend":{"seq":5,"active":{"id":"aa11","sha":"abc","seq":5}}}}', etag: '"e1"' }] })
    const { state, etag } = await readControlState(s3, 'b', 'k')
    expect(state.rollout.backend).toEqual({ seq: 5, active: { id: 'aa11', sha: 'abc', seq: 5 } })
    expect(etag).toBe('"e1"')
  })

  it('returns the empty state (no etag) when the object is missing', async () => {
    const { s3 } = makeS3({ get: [{ name: 'NoSuchKey' }] })
    const { state, etag } = await readControlState(s3, 'b', 'k')
    expect(state).toEqual(emptyControlState())
    expect(etag).toBeUndefined()
  })

  it('treats a 404 status as missing', async () => {
    const { s3 } = makeS3({ get: [{ status: 404 }] })
    const { state } = await readControlState(s3, 'b', 'k')
    expect(state).toEqual(emptyControlState())
  })

  it('rethrows unexpected errors', async () => {
    const { s3 } = makeS3({ get: [{ status: 500 }] })
    await expect(readControlState(s3, 'b', 'k')).rejects.toThrow(/get error/)
  })
})

describe('writeControlState', () => {
  it('writes serialized JSON and returns the etag', async () => {
    const { s3, puts } = makeS3({ putEtag: '"e2"' })
    const { etag } = await writeControlState(s3, 'b', 'k', emptyControlState())
    expect(etag).toBe('"e2"')
    expect(puts[0]!.Bucket).toBe('b')
    expect(puts[0]!.Key).toBe('k')
    expect(puts[0]!.ContentType).toBe('application/json')
    expect(JSON.parse(puts[0]!.Body as string).schemaVersion).toBe(2)
    expect(puts[0]!.IfMatch).toBeUndefined()
    expect(puts[0]!.IfNoneMatch).toBeUndefined()
  })

  it('passes conditional-write headers when provided', async () => {
    const { s3, puts } = makeS3({})
    await writeControlState(s3, 'b', 'k', emptyControlState(), { ifMatch: '"e1"' })
    expect(puts[0]!.IfMatch).toBe('"e1"')

    await writeControlState(s3, 'b', 'k', emptyControlState(), { ifNoneMatch: '*' })
    expect(puts[1]!.IfNoneMatch).toBe('*')
  })
})

/** Stateful single-object S3 mock honouring If-None-Match/If-Match preconditions,
 *  so the lock's create-if-absent and stale-break paths are exercised for real. */
function makeLockS3(initial?: LockInfo) {
  let obj: { body: string; etag: string } | undefined = initial ? { body: JSON.stringify(initial), etag: '"e1"' } : undefined
  let counter = 1
  const fail412 = () => Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed' })
  const send = vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, string> }) => {
    const kind = cmd.constructor.name
    const input = cmd.input
    if (kind === 'GetObjectCommand') {
      if (!obj) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
      return { Body: { transformToString: async () => obj!.body }, ETag: obj.etag }
    }
    if (kind === 'PutObjectCommand') {
      if (input.IfNoneMatch === '*' && obj) throw fail412()
      if (input.IfMatch && (!obj || obj.etag !== input.IfMatch)) throw fail412()
      obj = { body: input.Body, etag: `"e${++counter}"` }
      return { ETag: obj.etag }
    }
    if (kind === 'DeleteObjectCommand') {
      obj = undefined
      return {}
    }
    throw new Error(`unexpected command ${kind}`)
  })
  // biome-ignore lint/suspicious/noExplicitAny: minimal mock surface
  return { s3: { send } as any, current: () => obj }
}

describe('lock keys', () => {
  it('derives a sibling lock key', () => {
    expect(lockKey('organization/infra/production')).toBe('control/production.lock.json')
  })
})

describe('acquireLock / releaseLock', () => {
  const opts = { owner: 'operator:a', operation: 'apply', ttlMs: 60_000, now: 1_000_000 }

  it('acquires when no lock exists', async () => {
    const { s3, current } = makeLockS3()
    const res = await acquireLock(s3, 'b', 'k', opts)
    expect(res.acquired).toBe(true)
    expect(current()).toBeDefined()
  })

  it('refuses when a live lock is held by someone else', async () => {
    const held: LockInfo = { owner: 'operator:b', operation: 'deploy', acquiredAt: '', expiresAt: new Date(2_000_000).toISOString() }
    const { s3 } = makeLockS3(held)
    const res = await acquireLock(s3, 'b', 'k', opts)
    expect(res.acquired).toBe(false)
    if (!res.acquired) expect(res.held.owner).toBe('operator:b')
  })

  it('breaks and takes an expired lock', async () => {
    const expired: LockInfo = { owner: 'operator:b', operation: 'deploy', acquiredAt: '', expiresAt: new Date(500_000).toISOString() }
    const { s3, current } = makeLockS3(expired)
    const res = await acquireLock(s3, 'b', 'k', opts)
    expect(res.acquired).toBe(true)
    expect(JSON.parse(current()!.body).owner).toBe('operator:a')
  })

  it('release removes our own lock', async () => {
    const { s3, current } = makeLockS3()
    await acquireLock(s3, 'b', 'k', opts)
    await releaseLock(s3, 'b', 'k', 'operator:a')
    expect(current()).toBeUndefined()
  })

  it('release leaves a lock owned by someone else', async () => {
    const other: LockInfo = { owner: 'operator:b', operation: 'deploy', acquiredAt: '', expiresAt: new Date(2_000_000).toISOString() }
    const { s3, current } = makeLockS3(other)
    await releaseLock(s3, 'b', 'k', 'operator:a')
    expect(current()).toBeDefined()
  })

  it('forceUnlock removes any lock and returns its info', async () => {
    const other: LockInfo = { owner: 'operator:b', operation: 'deploy', acquiredAt: '', expiresAt: new Date(2_000_000).toISOString() }
    const { s3, current } = makeLockS3(other)
    const info = await forceUnlock(s3, 'b', 'k')
    expect(info?.owner).toBe('operator:b')
    expect(current()).toBeUndefined()
  })
})

describe('ledger transitions', () => {
  it('setPending records the deploy intent without touching pointers', () => {
    const active = { id: 'aa11', sha: 'abc', seq: 3 }
    const next = setPending({ seq: 3, active }, 'def')
    expect(next).toEqual({ seq: 3, active, pendingSha: 'def' })
  })

  it('setPending on a brand-new service starts from the empty rollout', () => {
    expect(setPending(undefined, 'def')).toEqual({ seq: 0, pendingSha: 'def' })
  })

  it('promote advances seq, moves active to previous, and clears pending', () => {
    const active = { id: 'aa11', sha: 'abc', seq: 3 }
    const next = promote({ seq: 3, active, pendingSha: 'def' }, { id: 'bb22', sha: 'def' })
    expect(next).toEqual({ seq: 4, active: { id: 'bb22', sha: 'def', seq: 4 }, previous: active })
  })

  it('promote on a first deploy has no previous', () => {
    expect(promote(undefined, { id: 'bb22', sha: 'def' })).toEqual({ seq: 1, active: { id: 'bb22', sha: 'def', seq: 1 } })
  })

  it('rollback swaps active and previous (a pointer flip, no rebuild)', () => {
    const active = { id: 'bb22', sha: 'def', seq: 4 }
    const previous = { id: 'aa11', sha: 'abc', seq: 3 }
    expect(rollback({ seq: 4, active, previous, pendingSha: 'zzz' })).toEqual({ seq: 4, active: previous, previous: active })
  })

  it('rollback is a no-op (only clears pending) when there is no previous', () => {
    const active = { id: 'bb22', sha: 'def', seq: 4 }
    expect(rollback({ seq: 4, active, pendingSha: 'zzz' })).toEqual({ seq: 4, active })
  })

  it('emptyRollout starts at seq 0 with no pointers', () => {
    expect(emptyRollout()).toEqual({ seq: 0 })
  })
})
