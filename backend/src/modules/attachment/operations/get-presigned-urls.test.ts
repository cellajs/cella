import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '#/core/context';

// Mock the boundaries: RLS transaction passes through, DB query + signer + permission are stubbed.
vi.mock('#/db/tenant-context', () => ({
  tenantRead: (ctx: AuthContext, fn: (c: AuthContext) => unknown) => fn(ctx),
}));
const findAttachmentsByIds = vi.fn();
vi.mock('#/modules/attachment/attachment-queries', () => ({
  findAttachmentsByIds: (...args: unknown[]) => findAttachmentsByIds(...args),
}));
const getSignedUrlFromKey = vi.fn();
vi.mock('#/modules/attachment/helpers/signed-url', () => ({
  getSignedUrlFromKey: (...args: unknown[]) => getSignedUrlFromKey(...args),
}));
const checkAccessBatch = vi.fn();
vi.mock('#/permissions', () => ({ checkAccessBatch: (...args: unknown[]) => checkAccessBatch(...args) }));
vi.mock('#/permissions/access', () => ({ accessFrom: () => ({ userId: 'user-1', memberships: [] }) }));
const buildSubjectFromEntity = vi.fn();
vi.mock('#/permissions/build-subject', () => ({
  buildSubjectFromEntity: (...args: unknown[]) => buildSubjectFromEntity(...args),
}));

const { getPresignedUrlsOp } = await import('./get-presigned-urls');

const ctx = { var: { memberships: [] } } as unknown as AuthContext;

const attachmentA = {
  id: 'att-a',
  createdBy: 'user-1',
  bucketName: 'private-bucket',
  originalKey: 'org/attachments/original/a.jpg',
  thumbnailKey: 'org/attachments/thumbnail/a.jpg',
  convertedKey: null,
};
const attachmentB = {
  id: 'att-b',
  createdBy: 'user-2',
  bucketName: 'private-bucket',
  originalKey: 'org/attachments/original/b.jpg',
  thumbnailKey: null,
  convertedKey: 'org/attachments/converted/b.pdf',
};

/** Allow every subject the engine sees, keyed like the real BatchPermissionResult. */
const allowAll = (rows: { id: string }[]) => {
  const results = new Map(rows.map((row) => [row.id, { allowed: true, membership: null }]));
  checkAccessBatch.mockReturnValue({ results, decisions: new Map() });
};

beforeEach(() => {
  vi.clearAllMocks();
  getSignedUrlFromKey.mockImplementation(async (key: string) => `https://signed.example/${key}`);
  buildSubjectFromEntity.mockImplementation((_type: string, entity: { id: string }) => ({ id: entity.id }));
});

describe('getPresignedUrlsOp: fail-closed batch signing', () => {
  it('resolves rows once, signs each allowed pair, and dedupes repeated pairs', async () => {
    findAttachmentsByIds.mockResolvedValue([attachmentA, attachmentB]);
    allowAll([attachmentA, attachmentB]);

    const res = await getPresignedUrlsOp(ctx, {
      items: [
        { attachmentId: 'att-a', variant: 'thumbnail' },
        { attachmentId: 'att-b', variant: 'original' },
        { attachmentId: 'att-a', variant: 'thumbnail' },
      ],
    });

    expect(findAttachmentsByIds).toHaveBeenCalledTimes(1);
    expect(findAttachmentsByIds).toHaveBeenCalledWith(ctx, { ids: ['att-a', 'att-b'] });
    expect(getSignedUrlFromKey).toHaveBeenCalledTimes(2);
    expect(res).toEqual({
      success: true,
      data: {
        data: [
          {
            attachmentId: 'att-a',
            variant: 'thumbnail',
            url: `https://signed.example/${attachmentA.thumbnailKey}`,
          },
          {
            attachmentId: 'att-b',
            variant: 'original',
            url: `https://signed.example/${attachmentB.originalKey}`,
          },
        ],
        rejectedIds: [],
      },
    });
  });

  it('checks read access with subjects built from the resolved rows', async () => {
    findAttachmentsByIds.mockResolvedValue([attachmentA]);
    allowAll([attachmentA]);

    await getPresignedUrlsOp(ctx, { items: [{ attachmentId: 'att-a', variant: 'original' }] });

    expect(buildSubjectFromEntity).toHaveBeenCalledWith('attachment', attachmentA);
    expect(checkAccessBatch).toHaveBeenCalledWith({ userId: 'user-1', memberships: [] }, 'read', [{ id: 'att-a' }]);
  });

  it('falls back to the original key when the requested variant is missing', async () => {
    findAttachmentsByIds.mockResolvedValue([attachmentA]);
    allowAll([attachmentA]);

    const res = await getPresignedUrlsOp(ctx, { items: [{ attachmentId: 'att-a', variant: 'converted' }] });

    expect(getSignedUrlFromKey).toHaveBeenCalledWith(attachmentA.originalKey, {
      bucketName: 'private-bucket',
      publicBucket: false,
    });
    expect(res.success && res.data.data[0]?.variant).toBe('converted');
  });

  it('puts unresolved ids in rejectedIds and never signs them', async () => {
    findAttachmentsByIds.mockResolvedValue([attachmentA]);
    allowAll([attachmentA]);

    const res = await getPresignedUrlsOp(ctx, {
      items: [
        { attachmentId: 'att-a', variant: 'original' },
        { attachmentId: 'att-missing', variant: 'original' },
      ],
    });

    expect(getSignedUrlFromKey).toHaveBeenCalledTimes(1);
    expect(res.success && res.data.rejectedIds).toEqual(['att-missing']);
  });

  it('puts denied ids in rejectedIds, indistinguishable from missing ones', async () => {
    findAttachmentsByIds.mockResolvedValue([attachmentA, attachmentB]);
    const results = new Map([
      ['att-a', { allowed: true, membership: null }],
      ['att-b', { allowed: false, membership: null }],
    ]);
    checkAccessBatch.mockReturnValue({ results, decisions: new Map() });

    const res = await getPresignedUrlsOp(ctx, {
      items: [
        { attachmentId: 'att-a', variant: 'original' },
        { attachmentId: 'att-b', variant: 'original' },
        { attachmentId: 'att-missing', variant: 'original' },
      ],
    });

    expect(getSignedUrlFromKey).toHaveBeenCalledTimes(1);
    expect(res.success && res.data.rejectedIds).toEqual(['att-b', 'att-missing']);
  });

  it('succeeds with empty data when every item is rejected', async () => {
    findAttachmentsByIds.mockResolvedValue([]);
    checkAccessBatch.mockReturnValue({ results: new Map(), decisions: new Map() });

    const res = await getPresignedUrlsOp(ctx, { items: [{ attachmentId: 'att-missing', variant: 'original' }] });

    expect(res).toEqual({ success: true, data: { data: [], rejectedIds: ['att-missing'] } });
    expect(getSignedUrlFromKey).not.toHaveBeenCalled();
  });
});
