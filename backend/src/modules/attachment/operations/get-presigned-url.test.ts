import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '#/core/context';

// Mock the boundaries: RLS transaction passes through, DB query + signer + permission are stubbed.
vi.mock('#/db/tenant-context', () => ({
  tenantRead: (ctx: AuthContext, fn: (c: AuthContext) => unknown) => fn(ctx),
}));
const findAttachmentById = vi.fn();
vi.mock('#/modules/attachment/attachment-queries', () => ({
  findAttachmentById: (...args: unknown[]) => findAttachmentById(...args),
}));
const getSignedUrlFromKey = vi.fn();
vi.mock('#/modules/attachment/helpers/signed-url', () => ({
  getSignedUrlFromKey: (...args: unknown[]) => getSignedUrlFromKey(...args),
}));
const checkPermission = vi.fn();
vi.mock('#/permissions', () => ({ checkPermission: (...args: unknown[]) => checkPermission(...args) }));
vi.mock('#/permissions/actor', () => ({ actorFrom: () => ({}) }));
vi.mock('#/permissions/build-subject', () => ({ buildSubjectFromEntity: () => ({}) }));

const { getPresignedUrlOp } = await import('./get-presigned-url');

const ctx = { var: { memberships: [] } } as unknown as AuthContext;

const attachment = {
  id: 'att-1',
  bucketName: 'private-bucket',
  originalKey: 'org/attachments/original/a.jpg',
  thumbnailKey: 'org/attachments/thumbnail/a.jpg',
  convertedKey: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getSignedUrlFromKey.mockResolvedValue('https://signed.example/url');
  checkPermission.mockReturnValue({ isAllowed: true });
});

describe('getPresignedUrlOp — fail-closed id+variant signing', () => {
  it('signs the requested variant key from the resolved row', async () => {
    findAttachmentById.mockResolvedValue(attachment);
    const res = await getPresignedUrlOp(ctx, { attachmentId: 'att-1', variant: 'thumbnail' });
    expect(res).toEqual({ success: true, data: 'https://signed.example/url' });
    expect(getSignedUrlFromKey).toHaveBeenCalledWith(attachment.thumbnailKey, {
      bucketName: 'private-bucket',
      isPublic: false,
    });
  });

  it('defaults to the original key', async () => {
    findAttachmentById.mockResolvedValue(attachment);
    await getPresignedUrlOp(ctx, { attachmentId: 'att-1', variant: 'original' });
    expect(getSignedUrlFromKey).toHaveBeenCalledWith(attachment.originalKey, expect.anything());
  });

  it('falls back to the original key when the requested variant is missing', async () => {
    findAttachmentById.mockResolvedValue(attachment); // convertedKey is null
    await getPresignedUrlOp(ctx, { attachmentId: 'att-1', variant: 'converted' });
    expect(getSignedUrlFromKey).toHaveBeenCalledWith(attachment.originalKey, expect.anything());
  });

  it('cross-tenant / nonexistent id returns 404 and never signs', async () => {
    findAttachmentById.mockResolvedValue(undefined);
    const res = await getPresignedUrlOp(ctx, { attachmentId: 'missing', variant: 'original' });
    expect(res).toEqual({ success: false, error: 'not_found', status: 404 });
    expect(getSignedUrlFromKey).not.toHaveBeenCalled();
  });

  it('denies read → 403 and never signs', async () => {
    findAttachmentById.mockResolvedValue(attachment);
    checkPermission.mockReturnValue({ isAllowed: false });
    const res = await getPresignedUrlOp(ctx, { attachmentId: 'att-1', variant: 'original' });
    expect(res).toEqual({ success: false, error: 'forbidden', status: 403 });
    expect(getSignedUrlFromKey).not.toHaveBeenCalled();
  });
});
