import { appConfig } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPresignedUrlBatched = vi.fn(async (attachmentId: string) => `https://signed.example.test/${attachmentId}`);
vi.mock('~/modules/attachment/presign-batch', () => ({
  getPresignedUrlBatched: (attachmentId: string) => getPresignedUrlBatched(attachmentId),
}));
vi.mock('~/modules/attachment/offline/storage-service', () => ({
  attachmentStorage: { getSharedBlobUrl: async () => null, createBlobUrlWithVariant: async () => null },
}));
vi.mock('~/modules/attachment/offline/download-service', () => ({ downloadService: { queueForDownload: vi.fn() } }));
vi.mock('~/modules/attachment/query', () => ({ findAttachmentInCache: () => undefined }));

const { resolveBlockNoteFileRef } = await import('~/modules/attachment/helpers/resolve-url');

const organizationId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
const otherOrganizationId = '0199a1b2-c3d4-7e5f-8a6b-000000000000';
const ctx = { tenantId: 'tenant-1', organizationId };
const cdn = appConfig.s3.publicCDNUrl;
const ownKey = `${organizationId}/user-1/photo.webp`;

describe('resolveBlockNoteFileRef', () => {
  beforeEach(() => getPresignedUrlBatched.mockClear());

  it('must not load media from outside the organization via a block reference', async () => {
    const bypasses = [
      `${cdn}@evil.example/pixel.png`,
      `${cdn}.evil.example/pixel.png`,
      '//evil.example/pixel.png',
      '\\\\evil.example\\pixel.png',
      `${otherOrganizationId}/user-2/contract.png`,
      `${organizationId}/../${otherOrganizationId}/user-2/contract.png`,
      `${organizationId}/%2e%2e/${otherOrganizationId}/user-2/contract.png`,
      `${organizationId}/..%2f..%2f${otherOrganizationId}/contract.png`,
      'https://i.imgur.com/abc123.png',
      `${cdn}/${ownKey}`,
    ];

    for (const ref of bypasses) expect(await resolveBlockNoteFileRef(ref, ctx), ref).toBe('');
    expect(getPresignedUrlBatched).not.toHaveBeenCalled();
  });

  it('must not trust a key when the document names no organization', async () => {
    expect(await resolveBlockNoteFileRef(ownKey, { tenantId: 'tenant-1' })).toBe('');
  });

  it('resolves an own-organization key through the CDN and an attachment id by presign (positive control)', async () => {
    expect(await resolveBlockNoteFileRef(ownKey, ctx)).toBe(`${cdn}/${ownKey}`);

    const attachmentId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';
    expect(await resolveBlockNoteFileRef(attachmentId, ctx)).toBe(`https://signed.example.test/${attachmentId}`);
    expect(getPresignedUrlBatched).toHaveBeenCalledWith(attachmentId);
  });
});
