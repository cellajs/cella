import { appConfig } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPresignedUrlBatched = vi.fn(async (attachmentId: string) => `https://signed.example.test/${attachmentId}`);
class PresignRejectedError extends Error {}
vi.mock('~/modules/attachment/presign-batch', () => ({
  getPresignedUrlBatched: (attachmentId: string) => getPresignedUrlBatched(attachmentId),
  PresignRejectedError,
}));
vi.mock('~/modules/attachment/offline/storage-service', () => ({
  attachmentStorage: { getSharedBlobUrl: async () => null, createBlobUrlWithVariant: async () => null },
}));
vi.mock('~/modules/attachment/offline/download-service', () => ({ downloadService: { queueForDownload: vi.fn() } }));
type Row = { id: string; keys: { original: string }; createdBy: { id: string; name: string } | null };
const cachedRows = new Map<string, Row>();
const fetchedRows = new Map<string, Row>();
vi.mock('~/modules/attachment/query', () => ({
  findAttachmentInCache: (id: string) => cachedRows.get(id),
  fetchAttachment: async (_tenantId: string, _organizationId: string, id: string) => fetchedRows.get(id) ?? null,
}));

const { resolveBlockNoteFileRef } = await import('~/modules/attachment/helpers/resolve-url');
const { getPendingUpload } = await import('~/modules/attachment/helpers/pending-uploads');

const organizationId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
const otherOrganizationId = '0199a1b2-c3d4-7e5f-8a6b-000000000000';
const ctx = { tenantId: 'tenant-1', organizationId };
const cdn = appConfig.s3.publicCDNUrl;
const ownKey = `${organizationId}/user-1/photo.webp`;

describe('resolveBlockNoteFileRef', () => {
  beforeEach(() => {
    getPresignedUrlBatched.mockClear();
    cachedRows.clear();
    fetchedRows.clear();
  });

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

  it('renders nothing for an attachment the server refuses to sign, such as a row that is gone, and passes a failed request on', async () => {
    const attachmentId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2d';
    getPresignedUrlBatched.mockRejectedValueOnce(new PresignRejectedError(attachmentId));
    expect(await resolveBlockNoteFileRef(attachmentId, ctx)).toBe('');

    // A request that failed may succeed later: the caller keeps the error.
    getPresignedUrlBatched.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(resolveBlockNoteFileRef(attachmentId, ctx)).rejects.toThrow('Failed to fetch');
  });

  describe("a file still only on its uploader's device", () => {
    const uploader = { id: 'user-2', name: 'Ada Lovelace' };
    const localRow = (id: string): Row => ({
      id,
      keys: { original: 'blob:http://localhost:3000/0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2f' },
      createdBy: uploader,
    });

    it('tells an uncached pending row apart from a gone one after the server refuses to sign', async () => {
      const pendingId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1b02';
      fetchedRows.set(pendingId, localRow(pendingId));
      getPresignedUrlBatched.mockRejectedValueOnce(new PresignRejectedError(pendingId));
      expect(await resolveBlockNoteFileRef(pendingId, ctx)).toBe('');
      expect(getPendingUpload(pendingId)).toEqual({ uploader });

      const goneId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1b03';
      getPresignedUrlBatched.mockRejectedValueOnce(new PresignRejectedError(goneId));
      expect(await resolveBlockNoteFileRef(goneId, ctx)).toBe('');
      expect(getPendingUpload(goneId)).toBeUndefined();
    });
  });
});
