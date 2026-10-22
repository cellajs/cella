import { beforeEach, describe, expect, it, vi } from 'vitest';

const currentUser = { id: 'user-1' };
vi.mock('~/modules/user/user-store', () => ({ useUserStore: { getState: () => ({ user: currentUser }) } }));

const { clearStoredUploads, getBlockPendingUpload, markPendingUpload, pendingUploadMessage, subscribePendingUploads } = await import(
  '~/modules/attachment/helpers/pending-uploads'
);

describe('pending uploads', () => {
  beforeEach(() => clearStoredUploads(() => true));

  it("names the uploader's device by first name, or the viewer's other device", () => {
    expect(pendingUploadMessage({ uploader: { id: 'user-2', name: '  Ada   Lovelace ' } as never })).toEqual({
      key: 'c:only_on_device',
      params: { name: 'Ada' },
    });
    expect(pendingUploadMessage({ uploader: { id: 'user-1', name: 'Me Myself' } as never })).toEqual({ key: 'c:only_on_your_other_device' });
    expect(pendingUploadMessage({ uploader: null })).toEqual({ key: 'c:not_uploaded_yet' });
    expect(pendingUploadMessage({ uploader: { id: 'user-3', name: ' ' } as never })).toEqual({ key: 'c:not_uploaded_yet' });
  });

  it('finds a block by its attachmentId prop, or by an id-shaped url', () => {
    markPendingUpload('attachment-1', null);
    expect(getBlockPendingUpload({ attachmentId: 'attachment-1', url: 'key/of/a/preview.png' })).toEqual({ uploader: null });
    expect(getBlockPendingUpload({ url: 'attachment-1' })).toEqual({ uploader: null });
    expect(getBlockPendingUpload({ url: 'attachment-2' })).toBeUndefined();
  });

  it('tells subscribers only when a pending file arrives', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePendingUploads(listener);
    markPendingUpload('attachment-1', null);

    clearStoredUploads(() => false);
    expect(listener).not.toHaveBeenCalled();

    clearStoredUploads((id) => id === 'attachment-1');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getBlockPendingUpload({ url: 'attachment-1' })).toBeUndefined();
    unsubscribe();
  });
});
