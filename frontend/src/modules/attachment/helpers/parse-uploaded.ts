import type { Attachment } from 'sdk';
import { zAttachment } from 'sdk/zod.gen';
import { generateId } from 'shared/entity-id';
import { uploadTemplates } from 'shared/transloadit-config';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { createOptimisticEntity } from '~/query/basic/create-optimistic';

export const parseUploadedAttachments = (
  result: UploadedUppyFile<'attachment'>,
  organizationId: string,
): Attachment[] => {
  // Process original files
  const originalFiles = result[':original'] ?? [];

  const attachments: Attachment[] = [];
  const attachmentsByUploadId = new Map<string, Attachment>();
  const groupId = originalFiles.length > 1 ? generateId() : null;

  for (const file of originalFiles) {
    const { size, url, mime, original_name, original_id, user_meta } = file;

    // Keep a locally generated UUID for API writes. Upload IDs are only used
    // to correlate converted and thumbnail variants back to the original file.
    const uploadId = Array.isArray(original_id) ? original_id[0] : original_id;

    const filename = original_name || user_meta?.name || 'file';
    const extIndex = filename.lastIndexOf('.');
    const name = extIndex > 0 ? filename.substring(0, extIndex) : filename;

    // Use createOptimisticEntity to get schema defaults (including placeholder tx)
    const attachment = createOptimisticEntity(zAttachment, {
      size: String(size ?? 0),
      contentType: mime ?? 'application/octet-stream',
      filename,
      name,
      description: '',
      public: user_meta?.public === 'true',
      bucketName: user_meta?.bucketName,
      originalKey: url ?? '',
      groupId,
      organizationId,
    });

    attachments.push(attachment as Attachment);
    // Cast needed because hey-api generates non-nullable intersection for nullable refs.
    if (uploadId) attachmentsByUploadId.set(uploadId, attachment as Attachment);
  }

  //  Process converted + thumbnail variants
  const steps = uploadTemplates.attachment.use.filter((step) => step !== ':original');

  for (const step of steps) {
    const files = result[step] ?? [];

    for (const { url, mime, original_id } of files) {
      // Handle original_id being string or string[] from Transloadit
      const resolvedId = Array.isArray(original_id) ? original_id[0] : original_id;
      if (!resolvedId) continue;

      const target = attachmentsByUploadId.get(resolvedId);
      if (!target) continue;

      if (step.startsWith('converted_')) {
        target.convertedKey = url ?? null;
        target.convertedContentType = mime ?? null;
      }

      if (step.startsWith('thumb_')) {
        target.thumbnailKey = url ?? null;
      }
    }
  }

  return attachments;
};
