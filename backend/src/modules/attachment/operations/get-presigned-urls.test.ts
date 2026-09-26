import { appConfig } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserContext } from '#/core/context';

// Boundaries mocked: the RLS transaction passes through; DB query, signer and permission are stubbed.
vi.mock('#/db/tenant-context', () => ({
  tenantRead: (ctx: UserContext, fn: (c: UserContext) => unknown) => fn(ctx),
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
vi.mock('#/permissions/access', () => ({ accessFrom: () => ({ actorId: 'user-1', memberships: [] }) }));
const buildSubjectFromEntity = vi.fn();
vi.mock('#/permissions/build-subject', () => ({
  buildSubjectFromEntity: (...args: unknown[]) => buildSubjectFromEntity(...args),
}));

const { getPresignedUrlsOp } = await import('./get-presigned-urls');

const ctx = { var: { memberships: [] } } as unknown as UserContext;

// Keys sit under the organization's upload prefix, in the app's private bucket, as uploads land.
const attachmentA = {
  id: 'att-a',
  organizationId: 'org-1',
  createdBy: 'user-1',
  bucketName: appConfig.s3.privateBucket,
  keys: {
    original: 'org-1/user-1/a.jpg',
    preview: 'org-1/user-1/a-preview.jpg',
  },
};
const attachmentB = {
  id: 'att-b',
  organizationId: 'org-1',
  createdBy: 'user-2',
  bucketName: appConfig.s3.privateBucket,
  keys: {
    original: 'org-1/user-2/b.jpg',
    converted: 'org-1/user-2/b.pdf',
  },
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
        { attachmentId: 'att-a', variant: 'preview' },
        { attachmentId: 'att-b', variant: 'original' },
        { attachmentId: 'att-a', variant: 'preview' },
      ],
    });

    expect(findAttachmentsByIds).toHaveBeenCalledTimes(1);
    expect(findAttachmentsByIds).toHaveBeenCalledWith(ctx, { ids: ['att-a', 'att-b'] });
    expect(getSignedUrlFromKey).toHaveBeenCalledTimes(2);
    expect(res).toEqual({
      data: [
        {
          attachmentId: 'att-a',
          variant: 'preview',
          url: `https://signed.example/${attachmentA.keys.preview}`,
        },
        {
          attachmentId: 'att-b',
          variant: 'original',
          url: `https://signed.example/${attachmentB.keys.original}`,
        },
      ],
      rejectedIds: [],
    });
  });

  it('checks read access with subjects built from the resolved rows', async () => {
    findAttachmentsByIds.mockResolvedValue([attachmentA]);
    allowAll([attachmentA]);

    await getPresignedUrlsOp(ctx, { items: [{ attachmentId: 'att-a', variant: 'original' }] });

    expect(buildSubjectFromEntity).toHaveBeenCalledWith('attachment', attachmentA);
    expect(checkAccessBatch).toHaveBeenCalledWith({ actorId: 'user-1', memberships: [] }, 'read', [{ id: 'att-a' }]);
  });

  it('falls back to the original key when the requested variant is missing', async () => {
    findAttachmentsByIds.mockResolvedValue([attachmentA]);
    allowAll([attachmentA]);

    const res = await getPresignedUrlsOp(ctx, { items: [{ attachmentId: 'att-a', variant: 'converted' }] });

    expect(getSignedUrlFromKey).toHaveBeenCalledWith(attachmentA.keys.original, {
      bucketName: appConfig.s3.privateBucket,
      publicBucket: false,
    });
    expect(res.data[0]?.variant).toBe('converted');
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
    expect(res.rejectedIds).toEqual(['att-missing']);
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
    expect(res.rejectedIds).toEqual(['att-b', 'att-missing']);
  });

  it('rejects a whole id when a requested variant names storage outside its organization, never signing it', async () => {
    const planted = {
      ...attachmentB,
      keys: { original: attachmentB.keys.original, preview: 'org-2/user-9/secret.jpg' },
    };
    const foreignBucket = { ...attachmentA, id: 'att-c', bucketName: 'another-apps-bucket' };
    findAttachmentsByIds.mockResolvedValue([attachmentA, planted, foreignBucket]);
    allowAll([attachmentA, planted, foreignBucket]);

    const res = await getPresignedUrlsOp(ctx, {
      items: [
        { attachmentId: 'att-a', variant: 'original' },
        { attachmentId: 'att-b', variant: 'original' },
        { attachmentId: 'att-b', variant: 'preview' },
        { attachmentId: 'att-c', variant: 'original' },
      ],
    });

    expect(getSignedUrlFromKey).toHaveBeenCalledTimes(1);
    expect(res.data.map((item) => item.attachmentId)).toEqual(['att-a']);
    expect(res.rejectedIds).toEqual(['att-b', 'att-c']);
  });

  it('succeeds with empty data when every item is rejected', async () => {
    findAttachmentsByIds.mockResolvedValue([]);
    checkAccessBatch.mockReturnValue({ results: new Map(), decisions: new Map() });

    const res = await getPresignedUrlsOp(ctx, { items: [{ attachmentId: 'att-missing', variant: 'original' }] });

    expect(res).toEqual({ data: [], rejectedIds: ['att-missing'] });
    expect(getSignedUrlFromKey).not.toHaveBeenCalled();
  });
});
