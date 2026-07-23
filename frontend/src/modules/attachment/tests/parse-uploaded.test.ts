import { describe, expect, it, vi } from 'vitest';

// The user store is only consulted for createdBy/updatedBy stamps on the optimistic entity.
vi.mock('~/modules/user/user-store', () => ({
  useUserStore: { getState: () => ({ user: { id: 'user-1' } }) },
}));

import { parseUploadedAttachments } from '~/modules/attachment/helpers/parse-uploaded';
import type { UploadedFile, UploadedUppyFile } from '~/modules/common/uploader/types';

type AttachmentResult = UploadedUppyFile<'attachment'>;

/** A Transloadit `:original` result. `user_meta` carries the id minted in `onBeforeFileAdded`. */
function makeOriginal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'transloadit-id-1',
    original_id: 'upload-1',
    original_name: 'holiday.png',
    url: 'files/holiday.png',
    mime: 'image/png',
    size: 2048,
    user_meta: { attachmentId: 'att-uuid-1', publicBucket: 'false', bucketName: 'private' },
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

  it('gives each file its own id', () => {
    const result = makeResult({
      ':original': [
        makeOriginal({ original_id: 'upload-1', user_meta: { attachmentId: 'att-uuid-1' } }),
        makeOriginal({ original_id: 'upload-2', user_meta: { attachmentId: 'att-uuid-2' } }),
      ],
    });

    const attachments = parseUploadedAttachments(result, 'org-1');

    expect(attachments.map((a) => a.id)).toEqual(['att-uuid-1', 'att-uuid-2']);
  });

  it('falls back to a generated id when user_meta has none (uploads predating the meta)', () => {
    const result = makeResult({ ':original': [makeOriginal({ user_meta: {} })] });

    const [attachment] = parseUploadedAttachments(result, 'org-1');

    expect(attachment.id).toEqual(expect.any(String));
    expect(attachment.id.length).toBeGreaterThan(0);
  });

  it('correlates converted and thumbnail variants back to the original by upload id', () => {
    const result = makeResult({
      ':original': [makeOriginal()],
      converted_image: [
        { original_id: 'upload-1', url: 'files/holiday.webp', mime: 'image/webp' } as unknown as UploadedFile,
      ],
      thumb_image: [{ original_id: 'upload-1', url: 'files/holiday-thumb.png' } as unknown as UploadedFile],
    });

    const [attachment] = parseUploadedAttachments(result, 'org-1');

    // Variant correlation still keys off original_id, NOT the attachment id.
    expect(attachment.id).toBe('att-uuid-1');
    expect(attachment.convertedKey).toBe('files/holiday.webp');
    expect(attachment.convertedContentType).toBe('image/webp');
    expect(attachment.thumbnailKey).toBe('files/holiday-thumb.png');
  });

  it('groups a multi-file upload under one groupId, and leaves a single upload ungrouped', () => {
    const single = parseUploadedAttachments(makeResult({ ':original': [makeOriginal()] }), 'org-1');
    expect(single[0].groupId).toBeNull();

    const multi = parseUploadedAttachments(
      makeResult({
        ':original': [
          makeOriginal({ original_id: 'upload-1', user_meta: { attachmentId: 'att-uuid-1' } }),
          makeOriginal({ original_id: 'upload-2', user_meta: { attachmentId: 'att-uuid-2' } }),
        ],
      }),
      'org-1',
    );

    expect(multi[0].groupId).toEqual(expect.any(String));
    expect(multi[1].groupId).toBe(multi[0].groupId);
  });

  it('derives name from the filename without its extension', () => {
    const result = makeResult({ ':original': [makeOriginal({ original_name: 'holiday.png' })] });

    const [attachment] = parseUploadedAttachments(result, 'org-1');

    expect(attachment.filename).toBe('holiday.png');
    expect(attachment.name).toBe('holiday');
  });
});
