import { uploadTemplates } from '#/lib/transloadit/templates';

import type { AttachmentToInsert } from '~/modules/attachments/types';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { nanoid } from '~/utils/nanoid';

export const parseUploadedAttachments = (result: UploadedUppyFile<'attachment'>, organizationId: string, groupId = nanoid()) => {
  const uploadedAttachments: AttachmentToInsert[] = [];

  // Process original files
  const originalFiles = result[':original'] || [];
  for (const { size, url, mime, ext, type, original_name, original_id } of originalFiles) {
    uploadedAttachments.push({
      id: original_id || nanoid(),
      originalKey: url,
      size: String(size || 0),
      contentType: mime,
      filename: original_name || 'unknown',
      organizationId,
      type: type ?? ext,
    });
  }
  // Process all converted and thumbnail variants
  const processSteps = uploadTemplates.attachment.use.filter((step) => step !== ':original');

  for (const step of processSteps) {
    const processFiles = result[step] || [];
    if (!processFiles.length) continue;

    for (const { url, mime, type, original_id } of processFiles) {
      const target = uploadedAttachments.find((a) => a.id === original_id);
      if (!target) continue;

      if (step.includes('converted_')) {
        target.convertedKey = url;
        target.convertedContentType = mime;
        if (type) target.type = type;
      }

      if (step.includes('thumb_')) target.thumbnailKey = url;
    }
  }

  return uploadedAttachments.length > 1 ? uploadedAttachments.map((attachment) => ({ ...attachment, groupId })) : uploadedAttachments;
};
