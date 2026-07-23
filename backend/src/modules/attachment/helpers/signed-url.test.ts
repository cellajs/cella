import { describe, expect, it, vi } from 'vitest';

// The presigner signs locally (HMAC), so fake credentials produce a real URL offline.
vi.mock('#/env', () => ({
  env: { S3_ACCESS_KEY_ID: 'test-access-key', S3_ACCESS_KEY_SECRET: 'test-secret' },
}));

const { getSignedUrlFromKey } = await import('./signed-url');

describe('getSignedUrlFromKey', () => {
  it('signs private keys with the default 24h expiry', async () => {
    const url = await getSignedUrlFromKey('org/attachments/original/a.jpg', {
      publicBucket: false,
      bucketName: 'private-bucket',
    });

    const parsed = new URL(url);
    expect(parsed.pathname).toContain('org/attachments/original/a.jpg');
    expect(parsed.searchParams.get('X-Amz-Signature')).toBeTruthy();
    // Pin the default: a silent regression to an enormous expiry must fail here.
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('86400');
  });

  it('honors an explicit expiresIn', async () => {
    const url = await getSignedUrlFromKey('key.png', {
      publicBucket: false,
      bucketName: 'private-bucket',
      expiresIn: 300,
    });
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('300');
  });

  it('builds an unsigned public URL from the bucket host', async () => {
    const url = await getSignedUrlFromKey('avatars/a.png', { publicBucket: true, bucketName: 'public-bucket' });
    expect(url).toBe('https://public-bucket.s3.nl-ams.scw.cloud/avatars/a.png');
  });

  it('passes local blob URLs through untouched', async () => {
    const blobUrl = 'blob:http://localhost:3000/1234';
    await expect(getSignedUrlFromKey(blobUrl, { publicBucket: false, bucketName: 'x' })).resolves.toBe(blobUrl);
  });

  // Runs last: it swaps the env mock for the whole module registry.
  it('rejects with a typed 503 when credentials are absent', async () => {
    vi.resetModules();
    vi.doMock('#/env', () => ({ env: { S3_ACCESS_KEY_ID: '', S3_ACCESS_KEY_SECRET: '' } }));
    const { getSignedUrlFromKey: signUnconfigured } = await import('./signed-url');

    await expect(
      signUnconfigured('key.png', { publicBucket: false, bucketName: 'private-bucket' }),
    ).rejects.toMatchObject({
      status: 503,
      type: 'server_error',
    });
  });
});
