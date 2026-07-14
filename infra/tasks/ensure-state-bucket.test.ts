import { describe, expect, it, vi } from 'vitest'
import { assertBucketProject, ensureStateBucket, keyProjectMismatch } from './ensure-state-bucket'

/**
 * Builds a mock S3Client that responds to HEAD/CREATE commands using the
 * `responses` queue. Each command pops one response from its queue.
 */
function makeS3(responses: {
  head?: Array<true | { status: number }>
  create?: Array<true | { name: string }>
}) {
  const headQueue = [...(responses.head ?? [])]
  const createQueue = [...(responses.create ?? [])]
  const send = vi.fn(async (cmd: { constructor: { name: string } }) => {
    const kind = cmd.constructor.name
    if (kind === 'HeadBucketCommand') {
      const r = headQueue.shift()
      if (r === undefined) throw new Error('no more HEAD responses queued')
      if (r === true) return {}
      const err = Object.assign(new Error('head error'), { $metadata: { httpStatusCode: r.status } })
      throw err
    }
    if (kind === 'CreateBucketCommand') {
      const r = createQueue.shift()
      if (r === undefined) throw new Error('no more CREATE responses queued')
      if (r === true) return {}
      throw Object.assign(new Error(r.name), { name: r.name })
    }
    throw new Error(`unexpected command ${kind}`)
  })
  // biome-ignore lint/suspicious/noExplicitAny: minimal mock surface
  return { send } as any
}

describe('ensureStateBucket', () => {
  it('returns "exists" when HEAD succeeds (200)', async () => {
    const s3 = makeS3({ head: [true] })
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('exists')
    expect(s3.send).toHaveBeenCalledTimes(1)
  })

  it('returns "created" when HEAD 404 → CREATE 200', async () => {
    const s3 = makeS3({ head: [{ status: 404 }], create: [true] })
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('created')
    expect(s3.send).toHaveBeenCalledTimes(2)
  })

  it('treats HEAD 301 as not-exists (redirect on stale region)', async () => {
    const s3 = makeS3({ head: [{ status: 301 }], create: [true] })
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('created')
  })

  it('treats HEAD 403 as ambiguous → falls through to CREATE → BucketAlreadyOwnedByYou = "exists"', async () => {
    const s3 = makeS3({ head: [{ status: 403 }], create: [{ name: 'BucketAlreadyOwnedByYou' }] })
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('exists')
  })

  it('treats HEAD 403 as ambiguous → falls through to CREATE → BucketAlreadyExists as reusable', async () => {
    const s3 = makeS3({ head: [{ status: 403 }], create: [{ name: 'BucketAlreadyExists' }] })
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('exists')
  })

  it('throws on BucketAlreadyExists (taken by another account)', async () => {
    const s3 = makeS3({ head: [{ status: 404 }], create: [{ name: 'BucketAlreadyExists' }] })
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).rejects.toThrow(/taken by another account/)
  })

  it('rethrows unexpected HEAD errors (e.g. 500)', async () => {
    const s3 = makeS3({ head: [{ status: 500 }] })
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).rejects.toThrow(/head error/)
  })

  it('idempotency: a second call with HEAD 200 still returns "exists"', async () => {
    const s3 = makeS3({ head: [{ status: 404 }, true], create: [true] })
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('created')
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('exists')
  })
})

describe('keyProjectMismatch', () => {
  it('is silent when the key points at the app project', () => {
    expect(keyProjectMismatch('proj-a', 'proj-a', 'SCWKEY')).toBeUndefined()
  })

  it('names the key, both projects, and the remedy on mismatch', () => {
    const message = keyProjectMismatch('org-default', 'proj-a', 'SCWKEY')
    expect(message).toContain('SCWKEY')
    expect(message).toContain('org-default')
    expect(message).toContain('proj-a')
    expect(message).toMatch(/preferred project/)
  })
})

describe('assertBucketProject', () => {
  const listClient = (ownerId: string, buckets: string[]) =>
    ({ send: async () => ({ Owner: { ID: ownerId }, Buckets: buckets.map((Name) => ({ Name })) }) }) as never

  it('passes when the bucket is visible in the expected project', async () => {
    await expect(assertBucketProject(listClient('proj-a:proj-a', ['cella-pulumi-state-v2']), 'cella-pulumi-state-v2', 'proj-a')).resolves.toBeUndefined()
  })

  it('fails when the key operates in another project', async () => {
    await expect(assertBucketProject(listClient('org-default:org-default', ['cella-pulumi-state-v2']), 'cella-pulumi-state-v2', 'proj-a')).rejects.toThrow(/preferred project/)
  })

  it('fails when the bucket is not visible from the expected project', async () => {
    await expect(assertBucketProject(listClient('proj-a:proj-a', ['other-bucket']), 'cella-pulumi-state-v2', 'proj-a')).rejects.toThrow(/not visible/)
  })
})
