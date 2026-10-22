import { describe, expect, it, vi } from 'vitest';

// The user store is only consulted for createdBy/updatedBy stamps on the optimistic entity.
vi.mock('~/modules/user/user-store', () => ({
  userStore: { getState: () => ({ user: { id: 'user-1' } }) },
}));

import { uploadStorage } from 'shared/utils/upload-visibility';
import { parseUploadedAttachments } from '~/modules/attachment/helpers/parse-uploaded';
import type { UploadedFile, UploadResults } from '~/modules/common/uploader/types';

type AttachmentResult = UploadResults<'attachment'>;

/** A Transloadit `:original` result. `user_meta` carries the id minted in `onBeforeFileAdded`. */
function makeOriginal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'transloadit-id-1',
    original_id: 'upload-1',
    original_name: 'holiday.png',
    url: 'files/holiday.png',
    mime: 'image/png',
    size: 2048,
    user_meta: { attachmentId: 'att-uuid-1' },
    ...overrides,
  } as unknown as UploadedFile;
}

/** Build a results object with only the steps a test needs; the rest default to empty. */
function makeResult(partial: Partial<Record<string, unknown[]>>): AttachmentResult {
  return partial as unknown as AttachmentResult;
}

describe('parseUploadedAttachments', () => {
  it('reuses the attachment id minted before upload, so the row matches its local blob', () => {
    const result = makeResult({ ':original': [makeOriginal()] });

    const [attachment] = parseUploadedAttachments(result, 'org-1');

    // The blob was stored under this id at pick time; a fresh id here would orphan it.
    expect(attachment.id).toBe('att-uuid-1');
  });

  it('stores the row where the attachment template stores its files, whatever the upload metadata claims', () => {
    const claimed = { attachmentId: 'att-uuid-1', publicBucket: 'true', bucketName: 'another-apps-bucket' };
    const result = makeResult({ ':original': [makeOriginal({ user_meta: claimed })] });

    const [attachment] = parseUploadedAttachments(result, 'org-1');

    expect(attachment).toMatchObject(uploadStorage('attachment'));
  });
});
