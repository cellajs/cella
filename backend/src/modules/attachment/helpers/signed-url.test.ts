import { describe, expect, it, vi } from 'vitest';

// The presigner signs locally (HMAC), so fake credentials produce a real URL offline.
vi.mock('#/env', () => ({ env: { S3_ACCESS_KEY_ID: 'test-access-key', S3_ACCESS_KEY_SECRET: 'test-secret' } }));
// The setup's object storage stays mocked across `resetModules`, which would keep the first client below.
vi.unmock('#/lib/object-storage');

const { getSignedUrlFromKey } = await import('./signed-url');

const bucket = { bucketName: 'private-bucket' };

describe('getSignedUrlFromKey', () => {
  it('signs private keys with the default 2h expiry', async () => {
    const url = await getSignedUrlFromKey('org/attachments/original/a.jpg', { ...bucket, contentType: 'image/jpeg' });

    const parsed = new URL(url);
    expect(parsed.pathname).toContain('org/attachments/original/a.jpg');
    expect(parsed.searchParams.get('X-Amz-Signature')).toBeTruthy();
    // Pin the default so a regression to an enormous expiry fails here.
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('7200');
  });

  it('must force a download for a non-media attachment and pin the served type', async () => {
    const served = async (contentType: string | null) => {
      const { searchParams } = new URL(await getSignedUrlFromKey('org/user/a.html', { ...bucket, contentType }));
      return { disposition: searchParams.get('response-content-disposition'), type: searchParams.get('response-content-type') };
    };
    const download = { disposition: 'attachment', type: 'application/octet-stream' };

    // An uploaded page, an SVG and an XML type in a media family open nowhere as a document.
    for (const contentType of ['text/html', 'application/xhtml+xml', 'image/svg+xml', 'video/x+xml', 'text/html; charset=utf-8', null]) {
      expect(await served(contentType), String(contentType)).toEqual(download);
    }
    // HTML bytes under a declared `image/png` are served as an image, never with the type stored at upload.
    expect(await served('image/png')).toEqual({ disposition: 'inline', type: 'image/png' });
    for (const contentType of ['image/webp', 'video/mp4', 'audio/mpeg', 'application/pdf']) {
      expect(await served(contentType), contentType).toEqual({ disposition: 'inline', type: contentType });
    }
  });

  it('must not sign a blob: key, a local blob URL included', async () => {
    for (const key of ['blob:http://localhost:3000/0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c', 'blob:/../org/contract.pdf']) {
      await expect(getSignedUrlFromKey(key, { ...bucket, contentType: 'application/pdf' }), key).rejects.toMatchObject({
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

    await expect(signUnconfigured('key.png', { ...bucket, contentType: 'image/png' })).rejects.toMatchObject({
      status: 503,
      type: 'server_error',
    });
  });
});
