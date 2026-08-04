import { describe, expect, it, vi } from 'vitest';
import { assertBucketProject, ensureStateBucket, hardenStateBucket, keyProjectMismatch } from './ensure-state-bucket';

/**
 * Builds a mock S3Client that responds to HEAD/CREATE commands using the
 * `responses` queue. Each command pops one response from its queue.
 */
function makeS3(responses: { head?: Array<true | { status: number }>; create?: Array<true | { name: string }> }) {
  const headQueue = [...(responses.head ?? [])];
  const createQueue = [...(responses.create ?? [])];
  const send = vi.fn(async (cmd: { constructor: { name: string } }) => {
    const kind = cmd.constructor.name;
    if (kind === 'HeadBucketCommand') {
      const r = headQueue.shift();
      if (r === undefined) throw new Error('no more HEAD responses queued');
      if (r === true) return {};
      const err = Object.assign(new Error('head error'), { $metadata: { httpStatusCode: r.status } });
      throw err;
    }
    if (kind === 'CreateBucketCommand') {
      const r = createQueue.shift();
      if (r === undefined) throw new Error('no more CREATE responses queued');
      if (r === true) return {};
      throw Object.assign(new Error(r.name), { name: r.name });
    }
    throw new Error(`unexpected command ${kind}`);
  });
  // biome-ignore lint/suspicious/noExplicitAny: minimal mock surface
  return { send } as any;
}

describe('ensureStateBucket', () => {
  it('returns "exists" when HEAD succeeds (200)', async () => {
    const s3 = makeS3({ head: [true] });
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('exists');
    expect(s3.send).toHaveBeenCalledTimes(1);
  });

  it('returns "created" when HEAD 404 → CREATE 200', async () => {
    const s3 = makeS3({ head: [{ status: 404 }], create: [true] });
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('created');
    expect(s3.send).toHaveBeenCalledTimes(2);
  });

  it('treats HEAD 301 as not-exists (redirect on stale region)', async () => {
    const s3 = makeS3({ head: [{ status: 301 }], create: [true] });
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('created');
  });

  it('treats HEAD 403 as ambiguous → falls through to CREATE → BucketAlreadyOwnedByYou = "exists"', async () => {
    const s3 = makeS3({ head: [{ status: 403 }], create: [{ name: 'BucketAlreadyOwnedByYou' }] });
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('exists');
  });

  it('treats HEAD 403 as ambiguous → falls through to CREATE → BucketAlreadyExists as reusable', async () => {
    const s3 = makeS3({ head: [{ status: 403 }], create: [{ name: 'BucketAlreadyExists' }] });
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('exists');
  });

  it('throws on BucketAlreadyExists (taken by another account)', async () => {
    const s3 = makeS3({ head: [{ status: 404 }], create: [{ name: 'BucketAlreadyExists' }] });
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).rejects.toThrow(/taken by another account/);
  });

  it('rethrows unexpected HEAD errors (e.g. 500)', async () => {
    const s3 = makeS3({ head: [{ status: 500 }] });
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).rejects.toThrow(/head error/);
  });

  it('idempotency: a second call with HEAD 200 still returns "exists"', async () => {
    const s3 = makeS3({ head: [{ status: 404 }, true], create: [true] });
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('created');
    await expect(ensureStateBucket(s3, 'cella-pulumi-state')).resolves.toBe('exists');
  });
});

describe('hardenStateBucket', () => {
  /** Mock client resolving or 403-ing per command name. */
  const hardenClient = (deny: string[] = [], failWith?: { command: string; status: number }) => {
    const send = vi.fn(async (cmd: { constructor: { name: string } }) => {
      const kind = cmd.constructor.name;
      if (failWith && kind === failWith.command) {
        throw Object.assign(new Error('hard failure'), { $metadata: { httpStatusCode: failWith.status } });
      }
      if (deny.includes(kind)) {
        throw Object.assign(new Error('AccessDenied'), { $metadata: { httpStatusCode: 403 } });
      }
      return {};
    });
    // biome-ignore lint/suspicious/noExplicitAny: minimal mock surface
    return { send } as any;
  };

  it('applies versioning, encryption, and lifecycle', async () => {
    const s3 = hardenClient();
    const result = await hardenStateBucket(s3, 'cella-pulumi-state', () => {});
    expect(result.applied).toEqual(['versioning', 'encryption', 'lifecycle']);
    expect(result.denied).toEqual([]);
    const kinds = s3.send.mock.calls.map((c: [{ constructor: { name: string } }]) => c[0].constructor.name);
    expect(kinds).toEqual([
      'PutBucketVersioningCommand',
      'PutBucketEncryptionCommand',
      'PutBucketLifecycleConfigurationCommand',
    ]);
  });

  it('enables versioning and AES256 default encryption with the expected shapes', async () => {
    const s3 = hardenClient();
    await hardenStateBucket(s3, 'cella-pulumi-state', () => {});
    const [versioning, encryption, lifecycle] = s3.send.mock.calls.map((c: [{ input: unknown }]) => c[0].input);
    expect(versioning).toMatchObject({ VersioningConfiguration: { Status: 'Enabled' } });
    expect(encryption).toMatchObject({
      ServerSideEncryptionConfiguration: {
        Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
      },
    });
    expect(lifecycle).toMatchObject({
      LifecycleConfiguration: {
        Rules: [
          { NoncurrentVersionExpiration: { NoncurrentDays: 90 } },
          { Expiration: { ExpiredObjectDeleteMarker: true } },
        ],
      },
    });
  });

  it('tolerates AccessDenied per call (policy-restricted CI key) and reports it', async () => {
    const s3 = hardenClient([
      'PutBucketVersioningCommand',
      'PutBucketEncryptionCommand',
      'PutBucketLifecycleConfigurationCommand',
    ]);
    const result = await hardenStateBucket(s3, 'cella-pulumi-state', () => {});
    expect(result.applied).toEqual([]);
    expect(result.denied).toEqual(['versioning', 'encryption', 'lifecycle']);
  });

  it('mixes applied and denied when only some calls are restricted', async () => {
    const s3 = hardenClient(['PutBucketVersioningCommand']);
    const result = await hardenStateBucket(s3, 'cella-pulumi-state', () => {});
    expect(result.applied).toEqual(['encryption', 'lifecycle']);
    expect(result.denied).toEqual(['versioning']);
  });

  it('rethrows non-403 errors', async () => {
    const s3 = hardenClient([], { command: 'PutBucketEncryptionCommand', status: 500 });
    await expect(hardenStateBucket(s3, 'cella-pulumi-state', () => {})).rejects.toThrow(/hard failure/);
  });
});

describe('keyProjectMismatch', () => {
  it('is silent when the key points at the app project', () => {
    expect(keyProjectMismatch('proj-a', 'proj-a', 'SCWKEY')).toBeUndefined();
  });

  it('names the key, both projects, and the remedy on mismatch', () => {
    const message = keyProjectMismatch('org-default', 'proj-a', 'SCWKEY');
    expect(message).toContain('SCWKEY');
    expect(message).toContain('org-default');
    expect(message).toContain('proj-a');
    expect(message).toMatch(/preferred project/);
  });
});

describe('assertBucketProject', () => {
  const listClient = (ownerId: string, buckets: string[]) =>
    ({ send: async () => ({ Owner: { ID: ownerId }, Buckets: buckets.map((Name) => ({ Name })) }) }) as never;

  it('passes when the bucket is visible in the expected project', async () => {
    await expect(
      assertBucketProject(listClient('proj-a:proj-a', ['cella-pulumi-state']), 'cella-pulumi-state', 'proj-a'),
    ).resolves.toBeUndefined();
  });

  it('fails when the key operates in another project', async () => {
    await expect(
      assertBucketProject(
        listClient('org-default:org-default', ['cella-pulumi-state']),
        'cella-pulumi-state',
        'proj-a',
      ),
    ).rejects.toThrow(/preferred project/);
  });

  it('fails when the bucket is not visible from the expected project', async () => {
    await expect(
      assertBucketProject(listClient('proj-a:proj-a', ['other-bucket']), 'cella-pulumi-state', 'proj-a'),
    ).rejects.toThrow(/not visible/);
  });
});
