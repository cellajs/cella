import type { Attachment } from 'sdk';
import { zAttachment } from 'sdk/zod.gen';
import { uploadTemplates } from 'shared/transloadit-config';
import { generateId } from 'shared/utils/entity-id';
import { uploadStorage } from 'shared/utils/upload-visibility';
import type { UploadResults } from '~/modules/common/uploader/types';
import { createOptimisticEntity } from '~/query/basic/create-optimistic';

type UploadedFile = UploadResults<'attachment'>[':original'][number];

const uploadIdOf = (originalId: UploadedFile['original_id']) => (Array.isArray(originalId) ? originalId[0] : originalId);

const variantSteps = uploadTemplates.attachment.use.filter((step) => step !== ':original');

/** The stored keys of one uploaded original: its own, plus the converted, preview and thumbnail variants made from it. */
export const uploadedFileKeys = (
  result: Partial<UploadResults<'attachment'>>,
  original: UploadedFile,
): { keys: Attachment['keys']; convertedContentType: string | null } => {
  const keys: Attachment['keys'] = { original: original.url ?? '' };
  let convertedContentType: string | null = null;

  // Upload IDs only correlate converted and thumbnail variants with the original.
  const uploadId = uploadIdOf(original.original_id);
  if (!uploadId) return { keys, convertedContentType };

  for (const step of variantSteps) {
    for (const { url, mime, original_id } of result[step] ?? []) {
      if (uploadIdOf(original_id) !== uploadId) continue;

      if (step.startsWith('converted_')) {
        if (url) keys.converted = url;
        convertedContentType = mime ?? null;
      }

      // thumb_image_tiny writes the `thumbnail` variant and must be checked before the generic thumb_ prefix, which writes `preview`.
      if (step === 'thumb_image_tiny') {
        if (url) keys.thumbnail = url;
      } else if (step.startsWith('thumb_')) {
        if (url) keys.preview = url;
      }
    }
  }

  return { keys, convertedContentType };
};

export const parseUploadedAttachments = (
  result: UploadResults<'attachment'>,
  organizationId: string,
  /** The deepest home channel id column (`{ projectId }`) plus the channel's `public` flag; omitted = org-homed, private. */
  placement?: Record<string, string | boolean | null>,
): Attachment[] => {
  const originalFiles = result[':original'] ?? [];
  const groupId = originalFiles.length > 1 ? generateId() : null;
  // The row's storage follows the template, as the server stamps it; the upload's metadata has no say.
  const storage = uploadStorage('attachment');

  return originalFiles.map((file) => {
    const { size, mime, original_name, user_meta } = file;

    const filename = original_name || user_meta?.name || 'file';
    const extIndex = filename.lastIndexOf('.');
    const name = extIndex > 0 ? filename.substring(0, extIndex) : filename;

    // Schema defaults, including the placeholder tx.
    const attachment = createOptimisticEntity(zAttachment, {
      // Reuse the id minted before upload (round-tripped as user_meta) so the row matches the local blob stored under it.
      id: user_meta?.attachmentId,
      size: String(size ?? 0),
      contentType: mime ?? 'application/octet-stream',
      filename,
      name,
      description: '',
      ...storage,
      ...uploadedFileKeys(result, file),
      groupId,
      organizationId,
      ...placement,
    });

    // Cast needed because hey-api generates non-nullable intersection for nullable refs.
    return attachment as Attachment;
  });
};
