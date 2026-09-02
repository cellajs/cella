import type { Attachment } from 'sdk';
import { zAttachment } from 'sdk/zod.gen';
import { uploadTemplates } from 'shared/transloadit-config';
import { generateId } from 'shared/utils/entity-id';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { createOptimisticEntity } from '~/query/basic/create-optimistic';

export const parseUploadedAttachments = (
  result: UploadedUppyFile<'attachment'>,
  organizationId: string,
  /** Placement seam: the deepest home channel id column (`{ projectId }`); omitted = org-homed. */
  placement?: Record<string, string>,
): Attachment[] => {
  const originalFiles = result[':original'] ?? [];

  const attachments: Attachment[] = [];
  const attachmentsByUploadId = new Map<string, Attachment>();
  const groupId = originalFiles.length > 1 ? generateId() : null;

  for (const file of originalFiles) {
    const { size, url, mime, original_name, original_id, user_meta } = file;

    // Upload IDs only correlate converted and thumbnail variants with the original.
    const uploadId = Array.isArray(original_id) ? original_id[0] : original_id;

    const filename = original_name || user_meta?.name || 'file';
    const extIndex = filename.lastIndexOf('.');
    const name = extIndex > 0 ? filename.substring(0, extIndex) : filename;

    // Reuse the id minted before upload (round-tripped as user_meta) so the row matches the local blob stored under it.
    const attachmentId = user_meta?.attachmentId;

    // Schema defaults, including the placeholder tx.
    const attachment = createOptimisticEntity(zAttachment, {
      id: attachmentId,
      size: String(size ?? 0),
      contentType: mime ?? 'application/octet-stream',
      filename,
      name,
      description: '',
      publicBucket: user_meta?.publicBucket === 'true',
      bucketName: user_meta?.bucketName,
      keys: { original: url ?? '' },
      groupId,
      organizationId,
      ...placement,
    });

    attachments.push(attachment as Attachment);
    // Cast needed because hey-api generates non-nullable intersection for nullable refs.
    if (uploadId) attachmentsByUploadId.set(uploadId, attachment as Attachment);
  }

  const steps = uploadTemplates.attachment.use.filter((step) => step !== ':original');

  for (const step of steps) {
    const files = result[step] ?? [];

    for (const { url, mime, original_id } of files) {
      const resolvedId = Array.isArray(original_id) ? original_id[0] : original_id;
      if (!resolvedId) continue;

      const target = attachmentsByUploadId.get(resolvedId);
      if (!target) continue;

      if (step.startsWith('converted_')) {
        if (url) target.keys.converted = url;
        target.convertedContentType = mime ?? null;
      }

      // thumb_image_tiny writes the `thumbnail` variant and must be checked before the generic thumb_ prefix, which writes `preview`.
      if (step === 'thumb_image_tiny') {
        if (url) target.keys.thumbnail = url;
      } else if (step.startsWith('thumb_')) {
        if (url) target.keys.preview = url;
      }
    }
  }

  return attachments;
};
