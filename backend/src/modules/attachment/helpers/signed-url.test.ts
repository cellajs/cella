import { describe, expect, it, vi } from 'vitest';

// The presigner signs locally (HMAC), so fake credentials produce a real URL offline.
vi.mock('#/env', () => ({ env: { S3_ACCESS_KEY_ID: 'test-access-key', S3_ACCESS_KEY_SECRET: 'test-secret' } }));
// The setup's object storage stays mocked across `resetModules`, which would keep the first client below.
vi.unmock('#/lib/object-storage');

const { getSignedUrlFromKey } = await import('./signed-url');

describe('getSignedUrlFromKey', () => {
  it('signs private keys with the default 24h expiry', async () => {
    const url = await getSignedUrlFromKey('org/attachments/original/a.jpg', { bucketName: 'private-bucket' });

    const parsed = new URL(url);
    expect(parsed.pathname).toContain('org/attachments/original/a.jpg');
    expect(parsed.searchParams.get('X-Amz-Signature')).toBeTruthy();
    // Pin the default so a regression to an enormous expiry fails here.
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('86400');
  });

  it('must not sign a blob: key, a local blob URL included', async () => {
    for (const key of ['blob:http://localhost:3000/0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c', 'blob:/../org/contract.pdf']) {
      await expect(getSignedUrlFromKey(key, { bucketName: 'private-bucket' }), key).rejects.toMatchObject({
        status: 500,
        type: 'server_error',
      });
    }
  });

  // Runs last: it swaps the env mock for the whole module registry.
  it('rejects with a typed 503 when credentials are absent', async () => {
    vi.resetModules();
    vi.doMock('#/env', () => ({ env: { S3_ACCESS_KEY_ID: '', S3_ACCESS_KEY_SECRET: '' } }));
    const { getSignedUrlFromKey: signUnconfigured } = await import('./signed-url');

    await expect(signUnconfigured('key.png', { bucketName: 'private-bucket' })).rejects.toMatchObject({
      status: 503,
      type: 'server_error',
    });
  });
});
