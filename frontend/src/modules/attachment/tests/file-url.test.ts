import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({
  appConfig: { s3: { publicCDNUrl: 'https://cdn.example' } },
}));

const getPresignedUrlBatched = vi.fn().mockResolvedValue('https://signed.example/url');
vi.mock('../presign-batch', () => ({
  getPresignedUrlBatched: (...args: unknown[]) => getPresignedUrlBatched(...args),
}));

const { getCloudUrl } = await import('../file-url');

const baseAttachment = {
  id: 'att-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  originalKey: 'org/attachments/original/a.jpg',
  convertedKey: null,
  thumbnailKey: null,
};

describe('getCloudUrl public/private branch', () => {
  beforeEach(() => {
    getPresignedUrlBatched.mockClear();
  });

  it('builds a CDN URL from the key for public attachments, no presign call', async () => {
    const url = await getCloudUrl({ ...baseAttachment, publicBucket: true }, 'original');
    expect(url).toBe('https://cdn.example/org/attachments/original/a.jpg');
    expect(getPresignedUrlBatched).not.toHaveBeenCalled();
  });

  it('signs private attachments by id and never leaks the key into a CDN URL', async () => {
    const url = await getCloudUrl({ ...baseAttachment, publicBucket: false }, 'original');
    expect(url).toBe('https://signed.example/url');
    expect(getPresignedUrlBatched).toHaveBeenCalledWith('att-1', 'original', 'tenant-1', 'org-1');
  });

  it('returns null when the variant has no cloud key', async () => {
    const url = await getCloudUrl({ ...baseAttachment, publicBucket: false }, 'converted');
    // convertedKey is null: nothing to fetch, and nothing is signed either.
    expect(url).toBeNull();
    expect(getPresignedUrlBatched).not.toHaveBeenCalled();
  });
});
